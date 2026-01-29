/**
 * ErrorState - Consistent error display components
 *
 * Provides:
 * - User-friendly error messages
 * - Retry functionality
 * - Error boundary integration
 * - Accessible error announcements
 *
 * @see https://reetesh.in/blog/suspense-and-error-boundary-in-react-explained
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { clientLogger } from "@/lib/client-logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, FileQuestion, ShieldAlert, Home } from "lucide-react";
import Link from "next/link";

export interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message */
  message?: string;
  /** The actual error object */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Show retry button */
  showRetry?: boolean;
  /** Show home button */
  showHome?: boolean;
  /** Custom icon */
  icon?: React.ComponentType<{ className?: string }>;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom className */
  className?: string;
  /** Additional actions */
  actions?: React.ReactNode;
}

/**
 * Determine error type and return appropriate messaging
 */
function getErrorInfo(error?: Error | null, message?: string) {
  const errorMessage = message || error?.message || "An unexpected error occurred";

  // Network errors
  if (
    errorMessage.includes("fetch") ||
    errorMessage.includes("network") ||
    errorMessage.includes("Failed to fetch") ||
    error?.name === "TypeError"
  ) {
    return {
      icon: WifiOff,
      title: "Connection Error",
      message: "Unable to connect to the server. Please check your network connection.",
      isRetryable: true,
    };
  }

  // Server errors (5xx)
  if (
    errorMessage.includes("500") ||
    errorMessage.includes("502") ||
    errorMessage.includes("503") ||
    errorMessage.includes("server")
  ) {
    return {
      icon: ServerCrash,
      title: "Server Error",
      message: "The server encountered an error. Please try again later.",
      isRetryable: true,
    };
  }

  // Not found (404)
  if (errorMessage.includes("404") || errorMessage.includes("not found")) {
    return {
      icon: FileQuestion,
      title: "Not Found",
      message: "The requested resource could not be found.",
      isRetryable: false,
    };
  }

  // Auth errors
  if (
    errorMessage.includes("401") ||
    errorMessage.includes("403") ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("authentication")
  ) {
    return {
      icon: ShieldAlert,
      title: "Access Denied",
      message: "You don't have permission to access this resource.",
      isRetryable: false,
    };
  }

  // Default
  return {
    icon: AlertCircle,
    title: "Error",
    message: errorMessage,
    isRetryable: true,
  };
}

/**
 * Inline error message
 *
 * @example
 * ```tsx
 * {error && <ErrorMessage error={error} onRetry={refetch} />}
 * ```
 */
export function ErrorMessage({
  title,
  message,
  error,
  onRetry,
  showRetry = true,
  className,
}: ErrorStateProps) {
  const errorInfo = getErrorInfo(error, message);

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-md bg-destructive/10 text-destructive",
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="h-5 w-5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <p className="text-sm">{message || errorInfo.message}</p>
      </div>
      {showRetry && onRetry && errorInfo.isRetryable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="flex-shrink-0"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Full error state with icon and actions
 *
 * @example
 * ```tsx
 * <ErrorState
 *   error={error}
 *   onRetry={refetch}
 *   showHome
 * />
 * ```
 */
export function ErrorState({
  title,
  message,
  error,
  onRetry,
  showRetry = true,
  showHome = false,
  icon: CustomIcon,
  size = "md",
  className,
  actions,
}: ErrorStateProps) {
  const errorInfo = getErrorInfo(error, message);
  const Icon = CustomIcon || errorInfo.icon;

  const sizeClasses = {
    sm: {
      container: "p-4 gap-3",
      icon: "h-8 w-8",
      title: "text-base",
      message: "text-sm",
    },
    md: {
      container: "p-8 gap-4",
      icon: "h-12 w-12",
      title: "text-lg",
      message: "text-sm",
    },
    lg: {
      container: "p-12 gap-6",
      icon: "h-16 w-16",
      title: "text-xl",
      message: "text-base",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        sizes.container,
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="rounded-full bg-destructive/10 p-4">
        <Icon className={cn("text-destructive", sizes.icon)} />
      </div>

      <div className="space-y-2">
        <h3 className={cn("font-semibold", sizes.title)}>
          {title || errorInfo.title}
        </h3>
        <p className={cn("text-muted-foreground max-w-md", sizes.message)}>
          {message || errorInfo.message}
        </p>
      </div>

      <div className="flex items-center gap-3 mt-4">
        {showRetry && onRetry && errorInfo.isRetryable && (
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
        {showHome && (
          <Button variant="outline" asChild>
            <Link href="/staff">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

/**
 * Error card for inline error displays
 */
export function ErrorCard({
  title,
  message,
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const errorInfo = getErrorInfo(error, message);
  const Icon = errorInfo.icon;

  return (
    <Card className={cn("border-destructive/50", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <Icon className="h-5 w-5" />
          {title || errorInfo.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {message || errorInfo.message}
        </p>
      </CardContent>
      {onRetry && errorInfo.isRetryable && (
        <CardFooter>
          <Button onClick={onRetry} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Error Boundary component for catching React errors
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={<ErrorState />}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    clientLogger.error("Error caught by boundary:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorState
          error={this.state.error}
          onRetry={this.handleReset}
          showHome
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorState;
