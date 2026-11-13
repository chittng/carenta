import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { cleanupOpenApiDoc, createZodDto } from 'nestjs-zod';

import { apiErrorSchema } from '@carenta/shared';

export const API_DOCS_PATH = '/api/docs';
export const API_DOCS_JSON_PATH = '/api/docs-json';

/** Shared error body, registered once so endpoints can reference it. */
export class ErrorResponseDto extends createZodDto(apiErrorSchema) {}

export function createApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Carenta API')
    .setDescription(
      [
        'REST API của Carenta, nền tảng thuê xe tự lái.',
        '',
        'Mọi lỗi trả về dạng `{ code, message }`, trong đó `message` là tiếng Việt để hiển thị cho người dùng.',
        'Lỗi `VALIDATION_FAILED` có thêm `details`: danh sách `{ path, message }` cho từng trường sai.',
      ].join('\n'),
    )
    .setVersion('1')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
  return cleanupOpenApiDoc(document);
}

/** Scalar UI at /api/docs, raw OpenAPI JSON at /api/docs-json. */
export function setupApiDocs(app: INestApplication) {
  const document = createApiDocument(app);

  SwaggerModule.setup(API_DOCS_PATH, app, document, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: API_DOCS_JSON_PATH,
  });

  app.use(
    API_DOCS_PATH,
    apiReference({
      content: document,
      pageTitle: 'Carenta API',
    }),
  );
}
