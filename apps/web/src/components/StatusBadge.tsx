import React from 'react';
import { CampaignStatus, EmailStatus } from '@email-scheduler/shared';

interface StatusBadgeProps {
  status: CampaignStatus | EmailStatus | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  let badgeStyle = 'bg-gray-100 text-gray-700 border-gray-200';

  switch (status) {
    case 'SCHEDULED':
      badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
      break;
    case 'PROCESSING':
      badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse';
      break;
    case 'COMPLETED':
    case 'SENT':
      badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-300';
      break;
    case 'PARTIAL':
      badgeStyle = 'bg-purple-50 text-purple-700 border-purple-200';
      break;
    case 'RETRY_PENDING':
      badgeStyle = 'bg-orange-50 text-orange-700 border-orange-200';
      break;
    case 'FAILED':
      badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
      break;
    case 'CANCELLED':
      badgeStyle = 'bg-gray-100 text-gray-500 border-gray-200';
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeStyle}`}
    >
      {status}
    </span>
  );
};
