import { Redirect } from 'expo-router';

// The OAuth redirect can also open the app via deep link. The code exchange
// happens in signInWithGoogle(); this route just returns to the app.
export default function OAuthCallback() {
  return <Redirect href="/" />;
}
