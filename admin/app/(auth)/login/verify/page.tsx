import type { Metadata } from 'next';

import { signOut } from '@/app/(auth)/actions';
import { VerifyForm } from '@/components/auth/verify-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { routeAuthPage } from '@/lib/auth';

export const metadata: Metadata = { title: 'Authenticator code' };

export default async function VerifyPage() {
  await routeAuthPage('verify');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Enter your authenticator code</CardTitle>
        <CardDescription>Open your authenticator app and enter the 6-digit code for UNM Freedom Confessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm />
      </CardContent>
      <CardFooter>
        <form action={signOut}>
          <Button type="submit" variant="link" className="px-0">
            Use a different account
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
