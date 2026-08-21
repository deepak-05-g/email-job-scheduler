import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampaignDto, PaginationMeta } from '@email-scheduler/shared';
import { getCampaigns } from '../lib/api-client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { Pagination } from '../components/Pagination.js';
import { MailCheck, Plus, RefreshCw, ChevronRight } from 'lucide-react';

export const CampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaignsList = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCampaigns(page, 25);
      setCampaigns(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load campaigns';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaignsList(1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            Email Campaigns
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            View and manage all scheduled and processed bulk email campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCampaignsList(pagination.page)}
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
            onClick={() => fetchCampaignsList(pagination.page)}
            className="underline font-semibold hover:text-rose-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Campaigns Table Card */}
      <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading campaigns...</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <MailCheck className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-semibold text-gray-800">No campaigns found</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm mx-auto">
              You haven't scheduled any email campaigns yet.
            </p>
            <Link
              to="/campaigns/new"
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Compose Campaign
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-700">
                <thead className="bg-gray-50/70 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Subject</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Recipients</th>
                    <th className="px-5 py-3 font-semibold">Delivery Progress</th>
                    <th className="px-5 py-3 font-semibold">Start Time</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/70 transition">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900 max-w-xs truncate">
                          {c.subject}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {c.id}</div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-800">{c.totalCount}</td>
                      <td className="px-5 py-4">
                        <div className="space-y-1 min-w-[120px]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-emerald-700 font-medium">{c.sentCount} sent</span>
                            <span className="text-gray-400">/ {c.totalCount}</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div
                              className="bg-emerald-500 transition-all duration-500"
                              style={{
                                width: `${c.totalCount > 0 ? (c.sentCount / c.totalCount) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {new Date(c.startAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          to={`/campaigns/${c.id}`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium"
                        >
                          Details
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              pagination={pagination}
              onPageChange={(page) => fetchCampaignsList(page)}
              disabled={loading}
            />
          </>
        )}
      </div>
    </div>
  );
};
