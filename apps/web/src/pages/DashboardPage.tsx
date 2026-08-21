import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CampaignDto, EmailDto } from '@email-scheduler/shared';
import { getCampaigns, getScheduledEmails, getSentEmails } from '../lib/api-client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import {
  MailCheck,
  Clock,
  Send,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active tab on main view: 'scheduled' | 'sent' | 'campaigns'
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'campaigns'>('scheduled');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [scheduledEmails, setScheduledEmails] = useState<EmailDto[]>([]);
  const [sentEmails, setSentEmails] = useState<EmailDto[]>([]);

  const [totalCampaigns, setTotalCampaigns] = useState<number>(0);
  const [scheduledCount, setScheduledCount] = useState<number>(0);
  const [sentCount, setSentCount] = useState<number>(0);

  const loadDashboardData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [campaignsRes, scheduledRes, sentRes] = await Promise.all([
        getCampaigns(1, 10),
        getScheduledEmails(1, 20),
        getSentEmails(1, 20),
      ]);

      setCampaigns(campaignsRes.data);
      setTotalCampaigns(campaignsRes.pagination.total);

      setScheduledEmails(scheduledRes.data);
      setScheduledCount(scheduledRes.pagination.total);

      setSentEmails(sentRes.data);
      const totalSent = sentRes.data.filter((e: EmailDto) => e.status === 'SENT').length;
      setSentCount(totalSent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const filteredScheduled = scheduledEmails.filter(
    (e) =>
      e.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSent = sentEmails.filter(
    (e) =>
      e.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar (Figma Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-2xs">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails by recipient or subject..."
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition"
          />
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl border border-gray-200 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl border border-gray-200 transition"
            title="Filter"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <Link
            to="/campaigns/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-2xs transition"
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
            onClick={() => loadDashboardData()}
            className="underline font-semibold hover:text-rose-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => setActiveTab('scheduled')}
          className={`p-4 bg-white border rounded-2xl cursor-pointer transition shadow-2xs ${
            activeTab === 'scheduled'
              ? 'border-emerald-500/80 ring-1 ring-emerald-500/20'
              : 'border-gray-200/90 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Scheduled</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {loading ? '...' : scheduledCount}
          </p>
        </div>

        <div
          onClick={() => setActiveTab('sent')}
          className={`p-4 bg-white border rounded-2xl cursor-pointer transition shadow-2xs ${
            activeTab === 'sent'
              ? 'border-emerald-500/80 ring-1 ring-emerald-500/20'
              : 'border-gray-200/90 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Sent & Delivered</span>
            <Send className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{loading ? '...' : sentCount}</p>
        </div>

        <div
          onClick={() => setActiveTab('campaigns')}
          className={`p-4 bg-white border rounded-2xl cursor-pointer transition shadow-2xs ${
            activeTab === 'campaigns'
              ? 'border-emerald-500/80 ring-1 ring-emerald-500/20'
              : 'border-gray-200/90 hover:border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
            <span>Total Campaigns</span>
            <MailCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {loading ? '...' : totalCampaigns}
          </p>
        </div>
      </div>

      {/* Main Tabbed Email List (Figma Style Horizontal Rows) */}
      <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
        {/* Tab Headers */}
        <div className="flex items-center gap-4 px-5 pt-4 border-b border-gray-100 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`pb-3 relative transition ${
              activeTab === 'scheduled'
                ? 'text-emerald-700 border-b-2 border-emerald-600 font-bold'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Scheduled Emails ({scheduledCount})
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`pb-3 relative transition ${
              activeTab === 'sent'
                ? 'text-emerald-700 border-b-2 border-emerald-600 font-bold'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Sent Emails ({sentCount})
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`pb-3 relative transition ${
              activeTab === 'campaigns'
                ? 'text-emerald-700 border-b-2 border-emerald-600 font-bold'
                : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            Campaigns ({totalCampaigns})
          </button>
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading email feed...</span>
          </div>
        ) : activeTab === 'scheduled' ? (
          filteredScheduled.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-800">No scheduled emails found</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                All delayed jobs in BullMQ have completed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredScheduled.map((email) => (
                <div
                  key={email.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/80 transition gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-xs text-gray-900 truncate w-48 shrink-0">
                      {email.recipient}
                    </span>
                    <StatusBadge status={email.status} />
                    <span className="text-xs text-gray-600 truncate">{email.subject}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0 self-end sm:self-auto">
                    <span>{new Date(email.scheduledAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'sent' ? (
          filteredSent.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Send className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-gray-800">No sent emails recorded</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Worker processed emails will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredSent.map((email) => (
                <div
                  key={email.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/80 transition gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-xs text-gray-900 truncate w-48 shrink-0">
                      {email.recipient}
                    </span>
                    <StatusBadge status={email.status} />
                    <span className="text-xs text-gray-600 truncate">{email.subject}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 shrink-0 self-end sm:self-auto">
                    <span>
                      {email.sentAt ? new Date(email.sentAt).toLocaleString() : 'Delivered'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : /* Campaigns Tab */
        campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2">
              <MailCheck className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-gray-800">No campaigns yet</p>
            <Link
              to="/campaigns/new"
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Compose Campaign
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50/80 transition gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-xs text-gray-900 truncate w-48 shrink-0">
                    {c.subject}
                  </span>
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-gray-500">
                    {c.sentCount}/{c.totalCount} sent
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0 self-end sm:self-auto">
                  <span>{new Date(c.startAt).toLocaleString()}</span>
                  <Link
                    to={`/campaigns/${c.id}`}
                    className="p-1 text-gray-400 hover:text-emerald-700 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
