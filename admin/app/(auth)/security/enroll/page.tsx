import type { Metadata } from 'next';

import { signOut } from '@/app/(auth)/actions';
import { EnrollFlow } from '@/components/auth/enroll-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { routeAuthPage } from '@/lib/auth';

export const metadata: Metadata = { title: 'Set up your authenticator' };

export default async function EnrollPage() {
  await routeAuthPage('enroll');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Set up your authenticator</CardTitle>
        <CardDescription>
          The panel needs a second step at every sign-in: a code from an authenticator app on your phone.
          Setting it up signs you out of your other sessions, including the mobile app, once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EnrollFlow />
      </CardContent>
      <CardFooter>
        <form action={signOut}>
          <Button type="submit" variant="link" className="px-0">
            Cancel and sign out
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
