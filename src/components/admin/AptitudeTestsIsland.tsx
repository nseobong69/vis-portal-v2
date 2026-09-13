import AptitudeTests from './AptitudeTests';

interface Props {
  initialExams: Record<string, any>[];
  classes: { id: string; name: string }[];
}

export default function AptitudeTestsIsland(props: Props) {
  return <AptitudeTests {...props} />;
}
