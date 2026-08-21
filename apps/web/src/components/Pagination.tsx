import React from 'react';
import { PaginationMeta } from '@email-scheduler/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (newPage: number) => void;
  disabled?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  pagination,
  onPageChange,
  disabled = false,
}) => {
  const { page, totalPages, total, limit } = pagination;

  if (totalPages <= 1 && total <= limit) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100 rounded-b-xl sm:px-6">
      <div className="text-xs text-gray-500">
        Showing <span className="font-semibold text-gray-800">{(page - 1) * limit + 1}</span> to{' '}
        <span className="font-semibold text-gray-800">{Math.min(page * limit, total)}</span> of{' '}
        <span className="font-semibold text-gray-800">{total}</span> records
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || disabled}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-3.5 h-3.5 mr-1" />
          Previous
        </button>
        <span className="text-xs text-gray-500 font-medium px-2">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || disabled}
          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5 ml-1" />
        </button>
      </div>
    </div>
  );
};
