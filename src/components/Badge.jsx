import { STATUS_LABEL, KIND_LABEL, VERDICT_LABEL } from '../format.js';

const STATUS_COLOR = {
  draft: 'gray', submitted: 'blue', pm_approved: 'green', pm_rejected: 'red',
  executed: 'purple', shelved: 'gray', expired: 'gray',
  pending_open: 'amber', filled: 'green', cancelled: 'gray', rejected: 'red',
};

export function StatusBadge({ status }) {
  return <span className={`badge badge-${STATUS_COLOR[status] || 'gray'}`}>{STATUS_LABEL[status] || status}</span>;
}

export function KindBadge({ kind }) {
  return <span className="badge badge-purple">{KIND_LABEL[kind] || kind}</span>;
}

export function VerdictBadge({ verdict }) {
  const good = verdict === 'right_right';
  const bad = verdict === 'wrong_wrong';
  return <span className={`badge badge-${good ? 'green' : bad ? 'red' : 'amber'}`}>{VERDICT_LABEL[verdict] || verdict}</span>;
}

export function RoleBadge({ role }) {
  const color = { cio: 'purple', pm: 'blue', analyst: 'green', advisor: 'gray' }[role] || 'gray';
  return <span className={`badge badge-${color}`}>{role}</span>;
}
