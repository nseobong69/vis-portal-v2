import SignUpProfilesManager from './SignUpProfilesManager';

interface SignupRequest {
  id: string;
  full_name: string;
  gender: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  role: 'staff' | 'student' | 'parent';
  extra_info: string | null;
  status: string;
  submitted_at: string;
}

interface Props {
  initialPending: SignupRequest[];
  initialApproved: SignupRequest[];
  initialRejected: SignupRequest[];
}

export default function SignUpProfilesIsland(props: Props) {
  return <SignUpProfilesManager {...props} />;
}
