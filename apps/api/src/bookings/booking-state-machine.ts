import { HttpStatus, Injectable } from '@nestjs/common';

import { type ActorRole, type BookingStatus, ErrorCode } from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { type Booking, type Prisma } from '../generated/prisma/client.js';
import { BOOKING_JOBS, cancelBookingJobs, writeBookingJob } from './booking-jobs.js';

export interface BookingActor {
  role: ActorRole;
  userId: string | null;
}
type Tx = Prisma.TransactionClient;

const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, readonly ActorRole[]>>> = {
  PENDING_APPROVAL: {
    AWAITING_PAYMENT: ['OWNER'],
    CANCELLED: ['OWNER', 'RENTER', 'ADMIN', 'SYSTEM'],
  },
  AWAITING_PAYMENT: { CONFIRMED: ['SYSTEM'], CANCELLED: ['OWNER', 'RENTER', 'ADMIN', 'SYSTEM'] },
  CONFIRMED: {
    IN_PROGRESS: ['OWNER', 'RENTER', 'SYSTEM'],
    CANCELLED: ['OWNER', 'RENTER', 'ADMIN', 'SYSTEM'],
  },
  IN_PROGRESS: { RETURNED: ['OWNER', 'RENTER', 'SYSTEM'] },
  RETURNED: { DISPUTED: ['OWNER'], COMPLETED: ['SYSTEM', 'ADMIN'] },
  DISPUTED: { COMPLETED: ['ADMIN'] },
  COMPLETED: {},
  CANCELLED: {},
};

export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: ActorRole,
): void {
  const roles = TRANSITIONS[from][to];
  if (!roles)
    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.BOOKING_STATUS_CONFLICT,
      'Không thể chuyển trạng thái đơn thuê theo yêu cầu.',
    );
  if (!roles.includes(actor))
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      'Bạn không có quyền thực hiện thao tác này với đơn thuê.',
    );
}

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy đơn thuê.');

/**
 * The only writer of booking.status. Call inside the transaction performing the domain
 * action. Services still validate event-specific evidence (payment, mutual reports, etc.).
 * Every path locks car -> booking, including expiry, so it serializes with calendar edits.
 */
@Injectable()
export class BookingStateMachine {
  async lock(tx: Tx, bookingId: string): Promise<Booking> {
    const reference = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { carId: true },
    });
    if (!reference) throw notFound();
    await tx.$queryRaw`SELECT id FROM cars WHERE id = ${reference.carId}::uuid FOR UPDATE`;
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM bookings WHERE id = ${bookingId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound();
    return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  }

  async create(
    tx: Tx,
    data: Omit<Prisma.BookingUncheckedCreateInput, 'status'>,
    instantBook: boolean,
    actor: BookingActor,
    at: Date,
  ): Promise<Booking> {
    if (actor.role !== 'RENTER' || actor.userId !== data.renterId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Chỉ người thuê được tạo đơn thuê.',
      );
    }
    const status = instantBook ? 'AWAITING_PAYMENT' : 'PENDING_APPROVAL';
    const booking = await tx.booking.create({ data: { ...data, status } });
    await tx.bookingStatusLog.create({
      data: {
        bookingId: booking.id,
        fromStatus: null,
        toStatus: status,
        actorRole: actor.role,
        actorId: actor.userId,
        createdAt: at,
      },
    });
    const deadline = instantBook ? booking.paymentDeadlineAt : booking.approvalDeadlineAt;
    if (!deadline) throw new Error('A new booking must have a persisted expiry deadline');
    await writeBookingJob(
      tx,
      booking.id,
      instantBook ? BOOKING_JOBS.payment : BOOKING_JOBS.approval,
      deadline,
    );
    return booking;
  }

  async transition(
    tx: Tx,
    bookingId: string,
    to: BookingStatus,
    actor: BookingActor,
    at: Date,
    options: { note?: string; paymentDeadlineAt?: Date } = {},
  ): Promise<Booking> {
    const booking = await this.lock(tx, bookingId);
    assertBookingTransition(booking.status, to, actor.role);
    if (
      (actor.role === 'RENTER' && actor.userId !== booking.renterId) ||
      (actor.role === 'OWNER' && actor.userId !== booking.ownerId) ||
      (actor.role !== 'SYSTEM' && actor.userId === null) ||
      (actor.role === 'SYSTEM' && actor.userId !== null)
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Bạn không có quyền thao tác với đơn thuê này.',
      );
    }
    const patch: Prisma.BookingUncheckedUpdateInput = { status: to };
    if (to === 'CONFIRMED' && (!booking.paymentDeadlineAt || at >= booking.paymentDeadlineAt)) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.BOOKING_EXPIRED,
        'Đơn thuê đã hết hạn thanh toán.',
      );
    }
    if (to === 'AWAITING_PAYMENT') {
      if (!booking.approvalDeadlineAt || at >= booking.approvalDeadlineAt) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.BOOKING_EXPIRED,
          'Yêu cầu đã hết hạn chờ duyệt.',
        );
      }
      if (
        !options.paymentDeadlineAt ||
        options.paymentDeadlineAt <= at ||
        options.paymentDeadlineAt > booking.startAt
      ) {
        throw new Error('Approval must set a payment deadline after now and no later than pickup');
      }
      patch.paymentDeadlineAt = options.paymentDeadlineAt;
    }
    if (to === 'CONFIRMED') patch.confirmedAt = at;
    if (to === 'IN_PROGRESS') patch.pickedUpAt = at;
    if (to === 'RETURNED') patch.returnedAt = at;
    if (to === 'COMPLETED') patch.completedAt = at;
    if (to === 'CANCELLED') {
      patch.cancelledAt = at;
      patch.cancelledBy = actor.role;
      patch.cancellationReason = options.note ?? 'Đơn thuê đã bị huỷ.';
    }
    const updated = await tx.booking.update({ where: { id: booking.id }, data: patch });
    await tx.bookingStatusLog.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: to,
        actorRole: actor.role,
        actorId: actor.userId,
        note: options.note,
        createdAt: at,
      },
    });
    await cancelBookingJobs(tx, booking.id);
    if (to === 'AWAITING_PAYMENT' && updated.paymentDeadlineAt) {
      await writeBookingJob(tx, booking.id, BOOKING_JOBS.payment, updated.paymentDeadlineAt);
    }
    return updated;
  }

  /** Idempotent: deadlines and current status are always re-read under the same lock. */
  async expire(tx: Tx, bookingId: string, requestedAt?: Date): Promise<boolean> {
    const booking = await this.lock(tx, bookingId);
    const now = requestedAt ?? new Date();
    const deadline =
      booking.status === 'PENDING_APPROVAL'
        ? booking.approvalDeadlineAt
        : booking.status === 'AWAITING_PAYMENT'
          ? booking.paymentDeadlineAt
          : null;
    if (!deadline || deadline > now) return false;
    await this.transition(tx, booking.id, 'CANCELLED', { role: 'SYSTEM', userId: null }, now, {
      note:
        booking.status === 'PENDING_APPROVAL'
          ? 'Yêu cầu đã hết hạn chờ chủ xe duyệt.'
          : 'Đơn thuê đã hết hạn thanh toán.',
    });
    return true;
  }
}
