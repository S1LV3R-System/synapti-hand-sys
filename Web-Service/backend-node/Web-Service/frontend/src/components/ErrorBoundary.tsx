import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button, Typography, Space } from 'antd';
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console
    console.error('Error Boundary caught an error:', error, errorInfo);

    // TODO: Send to error tracking service (e.g., Sentry)
    // this.logErrorToService(error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div style={{ padding: '50px', maxWidth: '800px', margin: '0 auto' }}>
          <Result
            status="error"
            title="Something went wrong"
            subTitle="An unexpected error occurred while rendering this page. Please try reloading or contact support if the problem persists."
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={this.handleReload}
                >
                  Reload Page
                </Button>
                <Button
                  icon={<HomeOutlined />}
                  onClick={this.handleGoHome}
                >
                  Go Home
                </Button>
              </Space>
            }
          >
            {this.props.showDetails && this.state.error && (
              <div style={{ textAlign: 'left', marginTop: '20px' }}>
                <Paragraph>
                  <Text strong>Error Details:</Text>
                </Paragraph>
                <Paragraph>
                  <Text code>{this.state.error.toString()}</Text>
                </Paragraph>
                {this.state.errorInfo && (
                  <>
                    <Paragraph>
                      <Text strong>Component Stack:</Text>
                    </Paragraph>
                    <Paragraph>
                      <Text code style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.errorInfo.componentStack}
                      </Text>
                    </Paragraph>
                  </>
                )}
              </div>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Route Error Boundary
 * Specialized error boundary for route-level errors
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Route Error Boundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleGoBack = () => {
    window.history.back();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '50px', maxWidth: '600px', margin: '0 auto' }}>
          <Result
            status="500"
            title="Page Error"
            subTitle="This page encountered an error and couldn't be displayed."
            extra={
              <Space>
                <Button type="primary" onClick={this.handleGoBack}>
                  Go Back
                </Button>
                <Button onClick={this.handleGoHome}>
                  Go Home
                </Button>
              </Space>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
