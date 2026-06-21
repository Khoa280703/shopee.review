import { registerDecorator, ValidationOptions } from 'class-validator';
import { isReservedUsername } from './reserved-usernames';

export function IsNotReservedUsername(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotReservedUsername',
      target: object.constructor,
      propertyName,
      options: { message: 'Username không khả dụng', ...validationOptions },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && !isReservedUsername(value);
        },
      },
    });
  };
}
