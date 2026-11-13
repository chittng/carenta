import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  type INestApplication,
  Post,
  Query,
} from '@nestjs/common';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import request from 'supertest';
import { type App } from 'supertest/types.js';
import { z } from 'zod';

import { apiErrorSchema } from '@carenta/shared';

import { AppException } from '../src/common/errors/app.exception.js';
import { createTestApp } from './create-test-app.js';

class CreateThingDto extends createZodDto(
  z.object({
    name: z.string().min(2),
    seats: z.int().min(2).max(16),
  }),
) {}

class ListThingsQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
  }),
) {}

class ThingDto extends createZodDto(z.object({ id: z.string(), name: z.string() })) {}

/** Just the parts of the OpenAPI document the tests look at. */
const openApiDocSchema = z.object({
  info: z.object({ title: z.string() }),
  paths: z.record(z.string(), z.unknown()),
  components: z.object({
    schemas: z.record(
      z.string(),
      z.looseObject({
        required: z.array(z.string()).optional(),
        properties: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
  }),
});

/** Test-only routes that exercise validation and every branch of the exception filter. */
@Controller('test-things')
class TestThingsController {
  @Post()
  create(@Body() body: CreateThingDto) {
    return body;
  }

  @Get()
  list(@Query() query: ListThingsQueryDto) {
    return query;
  }

  @Get('serialized')
  @ZodResponse({ type: ThingDto })
  serialized(): ThingDto {
    const withInternalField = { id: 't1', name: 'Vios', secret: 'internal' };
    return withInternalField;
  }

  @Get('broken-response')
  @ZodResponse({ type: ThingDto })
  brokenResponse() {
    // Deliberately violates ThingDto to hit the serializer's failure path.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return { id: 1 } as unknown as ThingDto;
  }

  @Get('app-error')
  appError() {
    throw new AppException(
      HttpStatus.CONFLICT,
      'CAR_UNAVAILABLE',
      'Xe đã có người đặt trong khoảng thời gian này.',
    );
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException('Owner only');
  }

  @Get('crash')
  crash() {
    throw new Error('connection string postgres://secret@db leaked');
  }
}

describe('API app', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestThingsController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('validation', () => {
    it('passes a valid body through, dropping unknown keys', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-things')
        .send({ name: 'Vios', seats: 5, isAdmin: true })
        .expect(201);

      expect(res.body).toEqual({ name: 'Vios', seats: 5 });
    });

    it('rejects an invalid body with per-field details in Vietnamese', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-things')
        .send({ name: 'V', seats: 40 })
        .expect(400);
      const body = apiErrorSchema.parse(res.body);

      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.message).toBe('Dữ liệu không hợp lệ.');
      expect(body.details?.map((d) => d.path)).toEqual(['name', 'seats']);
      expect(body.details?.[0]?.message).toContain('Quá nhỏ');
      expect(body.details?.[1]?.message).toContain('Quá lớn');
    });

    it('coerces and defaults query parameters', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/test-things').expect(200);
      expect(res.body).toEqual({ page: 1 });

      const invalid = await request(app.getHttpServer())
        .get('/api/v1/test-things?page=0')
        .expect(400);
      expect(apiErrorSchema.parse(invalid.body).details?.[0]?.path).toBe('page');
    });

    it('rejects malformed JSON', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-things')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);

      expect(res.body).toEqual({
        code: 'BAD_REQUEST',
        message: 'Dữ liệu gửi lên không đúng định dạng JSON.',
      });
    });
  });

  describe('response serialization', () => {
    it('strips fields not declared in the response schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-things/serialized')
        .expect(200);

      expect(res.body).toEqual({ id: 't1', name: 'Vios' });
    });

    it('answers 500 when a handler returns data that breaks its schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-things/broken-response')
        .expect(500);

      expect(res.body).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      });
    });
  });

  describe('error format', () => {
    it('sends AppException code and message as-is', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-things/app-error')
        .expect(409);

      expect(res.body).toEqual({
        code: 'CAR_UNAVAILABLE',
        message: 'Xe đã có người đặt trong khoảng thời gian này.',
      });
    });

    it('replaces English messages of built-in HTTP exceptions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-things/forbidden')
        .expect(403);

      expect(res.body).toEqual({
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    });

    it('answers unknown routes with NOT_FOUND', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      expect(res.body).toEqual({ code: 'NOT_FOUND', message: 'Không tìm thấy nội dung yêu cầu.' });
    });

    it('hides details of unexpected errors', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/test-things/crash').expect(500);

      expect(res.body).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      });
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });
  });

  describe('CORS', () => {
    it('allows the web origin with credentials', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not allow other origins', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('Origin', 'https://evil.example')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('API docs', () => {
    it('serves the Scalar reference page', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs').expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Carenta API');
    });

    it('serves the OpenAPI document with zod schemas', async () => {
      const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
      const doc = openApiDocSchema.parse(res.body);
      const { schemas } = doc.components;

      expect(doc.info.title).toBe('Carenta API');
      expect(doc.paths['/api/v1/health']).toMatchObject({ get: { responses: { 200: {} } } });
      expect(schemas.ErrorResponseDto?.required).toEqual(['code', 'message']);
      expect(schemas.CreateThingDto?.properties?.seats).toMatchObject({
        type: 'integer',
        minimum: 2,
        maximum: 16,
      });
    });
  });
});
