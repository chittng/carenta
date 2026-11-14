import { type ActorRole, type BookingStatus } from '@carenta/shared';

import { assertBookingTransition } from './booking-state-machine.js';

describe('booking transition policy', () => {
  it.each<[BookingStatus, BookingStatus, ActorRole]>([
    ['PENDING_APPROVAL', 'AWAITING_PAYMENT', 'OWNER'],
    ['PENDING_APPROVAL', 'CANCELLED', 'OWNER'],
    ['PENDING_APPROVAL', 'CANCELLED', 'SYSTEM'],
    ['PENDING_APPROVAL', 'CANCELLED', 'RENTER'],
    ['AWAITING_PAYMENT', 'CONFIRMED', 'SYSTEM'],
    ['AWAITING_PAYMENT', 'CANCELLED', 'SYSTEM'],
    ['AWAITING_PAYMENT', 'CANCELLED', 'ADMIN'],
    ['CONFIRMED', 'IN_PROGRESS', 'RENTER'],
    ['CONFIRMED', 'IN_PROGRESS', 'OWNER'],
    ['CONFIRMED', 'CANCELLED', 'OWNER'],
    ['IN_PROGRESS', 'RETURNED', 'RENTER'],
    ['RETURNED', 'DISPUTED', 'OWNER'],
    ['RETURNED', 'COMPLETED', 'SYSTEM'],
    ['DISPUTED', 'COMPLETED', 'ADMIN'],
  ])('permits %s -> %s by %s', (from, to, actor) => {
    expect(() => assertBookingTransition(from, to, actor)).not.toThrow();
  });

  it.each<[BookingStatus, BookingStatus, ActorRole]>([
    ['PENDING_APPROVAL', 'CONFIRMED', 'SYSTEM'],
    ['AWAITING_PAYMENT', 'IN_PROGRESS', 'SYSTEM'],
    ['CONFIRMED', 'COMPLETED', 'OWNER'],
    ['IN_PROGRESS', 'COMPLETED', 'SYSTEM'],
    ['COMPLETED', 'CANCELLED', 'ADMIN'],
    ['CANCELLED', 'CONFIRMED', 'SYSTEM'],
    ['DISPUTED', 'RETURNED', 'ADMIN'],
    ['PENDING_APPROVAL', 'PENDING_APPROVAL', 'OWNER'],
  ])('rejects illegal %s -> %s by %s', (from, to, actor) => {
    expect(() => assertBookingTransition(from, to, actor)).toThrow('Không thể chuyển trạng thái');
  });

  it.each<[BookingStatus, BookingStatus, ActorRole]>([
    ['PENDING_APPROVAL', 'AWAITING_PAYMENT', 'RENTER'],
    ['PENDING_APPROVAL', 'AWAITING_PAYMENT', 'SYSTEM'],
    ['AWAITING_PAYMENT', 'CONFIRMED', 'OWNER'],
    ['AWAITING_PAYMENT', 'CONFIRMED', 'RENTER'],
    ['RETURNED', 'DISPUTED', 'RENTER'],
    ['DISPUTED', 'COMPLETED', 'OWNER'],
    ['RETURNED', 'COMPLETED', 'RENTER'],
  ])('rejects an unauthorized actor for %s -> %s: %s', (from, to, actor) => {
    expect(() => assertBookingTransition(from, to, actor)).toThrow('không có quyền');
  });
});
