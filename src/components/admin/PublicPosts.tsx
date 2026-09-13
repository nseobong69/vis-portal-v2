import PublicPosts from './PublicPosts';

interface Props {
  initialPosts: Record<string, any>[];
  userId: string;
  userRole: string;
}

export default function PublicPostsIsland(props: Props) {
  return <PublicPosts {...props} />;
}
