import { Badge } from '@/components/ui/badge';
import type { Database } from '@/types/database';

type Role = Database['public']['Enums']['app_role'];

const LABEL: Record<Role, string> = { admin: 'Admin', moderator: 'Moderator', user: 'User' };

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge className={role === 'admin' ? 'bg-gold text-gold-foreground' : 'bg-secondary text-secondary-foreground'}>
      {LABEL[role]}
    </Badge>
  );
}
