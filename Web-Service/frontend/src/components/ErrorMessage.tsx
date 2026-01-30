import { AlertCircle, XCircle } from 'lucide-react';
import { Button } from './Button';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorMessage = ({
  title = 'Error',
  message,
  onRetry,
  onDismiss,
}: ErrorMessageProps) => {
  return (
    <div className="rounded-lg bg-error-50 p-4 border border-error-200">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-error-400" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-error-800">{title}</h3>
          <div className="mt-2 text-sm text-error-700">
            <p>{message}</p>
          </div>
          {(onRetry || onDismiss) && (
            <div className="mt-4 flex gap-3">
              {onRetry && (
                <Button variant="error" size="sm" onClick={onRetry}>
                  Try Again
                </Button>
              )}
              {onDismiss && (
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className="inline-flex rounded-md text-error-400 hover:text-error-500 focus:outline-none"
              aria-label="Dismiss"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
