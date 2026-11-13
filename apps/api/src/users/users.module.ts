import { Module } from '@nestjs/common';

import { MyProfileController, PublicProfileController } from './users.controller.js';
import { UsersService } from './users.service.js';

/** Private and public user profiles (spec §2, §13). */
@Module({
  controllers: [MyProfileController, PublicProfileController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
