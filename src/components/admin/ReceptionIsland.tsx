import Reception from './Reception';

interface Props {
  initialVisitors: Record<string, any>[];
  schoolName: string;
  logoUrl: string | null;
}

export default function ReceptionIsland(props: Props) {
  return <Reception {...(props as any)} />;
}
