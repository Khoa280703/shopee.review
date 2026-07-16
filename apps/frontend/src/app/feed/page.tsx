import { redirect } from 'next/navigation';

// The following-feed lives as the "Following" tab on the home screen now.
// Keep this route as a redirect so old links / bookmarks still work.
export default function FeedRedirect() {
  redirect('/?tab=following');
}
