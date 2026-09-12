import ParentsManager from './ParentsManager';

interface Parent {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  relationship: string | null;
  linked_students: string | null;
  student_ids: string[] | null;
  has_account: boolean;
  auth_id: string | null;
}

interface Student {
  id: string;
  full_name: string;
  class_name: string | null;
}

interface Props {
  initialParents: Parent[];
  students: Student[];
  isSuperAdmin: boolean;
}

export default function ParentsIsland(props: Props) {
  return <ParentsManager {...props} />;
}
