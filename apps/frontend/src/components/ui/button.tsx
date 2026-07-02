import { buttonClasses, type ButtonVariant, type ButtonSize } from './button-classes';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({ className, variant, size, fullWidth, ...props }: ButtonProps) {
  return <button className={buttonClasses({ variant, size, fullWidth, className })} {...props} />;
}
