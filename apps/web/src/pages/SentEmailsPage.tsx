import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmailDto, PaginationMeta } from '@email-scheduler/shared';
import { getSentEmails } from '../lib/api-client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Pagination } from '../components/Pagination.js';
import { Send, RefreshCw, AlertCircle, Plus } from 'lucide-react';

export const SentEmailsPage: React.FC = () => {
  const [emails, setEmails] = useState<EmailDto[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSent = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSentEmails(page, 25);
      setEmails(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sent emails';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSent(1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            Sent & Delivered Emails
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Review delivery outcomes and audit logs for completed or failed email dispatches.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchSent(pagination.page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/campaigns/new"
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Compose
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => fetchSent(pagination.page)}
            className="underline font-semibold hover:text-rose-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading sent emails...</span>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <Send className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-semibold text-gray-800">No sent emails recorded yet</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm mx-auto">
              Emails processed by the worker will appear here with delivery timestamps.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50/70 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Recipient</th>
                    <th className="px-5 py-3 font-semibold">Subject</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Sent / Updated At</th>
                    <th className="px-5 py-3 font-semibold">Attempts</th>
                    <th className="px-5 py-3 font-semibold">Details / Error</th>
                    <th className="px-5 py-3 font-semibold text-right">Campaign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {emails.map((email) => (
                    <tr key={email.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-5 py-3.5 font-medium text-gray-900 font-mono">
                        {email.recipient}
                      </td>
                      <td className="px-5 py-3.5 text-gray-700 max-w-xs truncate">
                        {email.subject}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={email.status} />
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {email.sentAt
                          ? new Date(email.sentAt).toLocaleString()
                          : new Date(email.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800">
                        {email.attemptCount}
                      </td>
                      <td className="px-5 py-3.5 max-w-xs truncate">
                        {email.status === 'FAILED' ? (
                          <span className="text-rose-600 font-mono inline-flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {email.failureReason || 'Failed'}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Delivered</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          to={`/campaigns/${email.campaignId}`}
                          className="text-emerald-700 hover:text-emerald-900 font-medium"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              pagination={pagination}
              onPageChange={(page) => fetchSent(page)}
              disabled={loading}
            />
          </>
        )}
      </div>
    </div>
  );
};
