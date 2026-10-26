import type { Metadata } from 'next';
import { Info } from 'lucide-react';

import { LoginForm } from '@/components/auth/login-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { routeAuthPage } from '@/lib/auth';
import { timeoutMessage } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  await routeAuthPage('login');

  const { reason } = await searchParams;
  const notice = timeoutMessage(typeof reason === 'string' ? reason : undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Use your moderator or admin account. You will also need your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notice ? (
          <Alert>
            <Info />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
