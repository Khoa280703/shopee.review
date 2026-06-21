import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsNotReservedUsername } from '../../common/is-not-reserved-username.validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/, { message: 'username chỉ dùng a-z, 0-9, dấu gạch dưới' })
  @IsNotReservedUsername()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;
}
