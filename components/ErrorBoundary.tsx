import React from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Sentry from '@sentry/react-native';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ color: '#666', marginBottom: 16 }}>
            {this.state.error.message ?? 'An unexpected error occurred.'}
          </Text>
          <Pressable
            onPress={this.reset}
            style={{ backgroundColor: '#D97757', borderRadius: 10, padding: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
