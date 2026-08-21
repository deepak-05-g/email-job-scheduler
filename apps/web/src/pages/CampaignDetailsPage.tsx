import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CampaignDetailsDto } from '@email-scheduler/shared';
import { getCampaignById } from '../lib/api-client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ArrowLeft, RefreshCw, Star, Trash2 } from 'lucide-react';

export const CampaignDetailsPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<CampaignDetailsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(
    async (isManual = false) => {
      if (!campaignId) return;
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await getCampaignById(campaignId);
        setCampaign(response.campaign);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load campaign details';
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [campaignId]
  );

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Auto-refresh periodically if status is SCHEDULED or PROCESSING
  useEffect(() => {
    if (!campaign || (campaign.status !== 'SCHEDULED' && campaign.status !== 'PROCESSING')) {
      return;
    }

    const timer = setInterval(() => {
      fetchCampaign(true);
    }, 4000);

    return () => clearInterval(timer);
  }, [campaign, fetchCampaign]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading campaign details...</span>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="space-y-4">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Campaigns
        </Link>
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs">
          <p className="font-semibold">{error || 'Campaign not found'}</p>
          <button
            onClick={() => fetchCampaign()}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const sentPercentage =
    campaign.totalCount > 0 ? (campaign.sentCount / campaign.totalCount) * 100 : 0;
  const failedPercentage =
    campaign.totalCount > 0 ? (campaign.failedCount / campaign.totalCount) * 100 : 0;
  const pendingCount = campaign.totalCount - campaign.sentCount - campaign.failedCount;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header Row (Figma Style Email View) */}
      <div className="bg-white border border-gray-200/90 rounded-2xl p-6 md:p-8 shadow-2xs space-y-6">
        {/* Subject Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/campaigns"
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight truncate">
              {campaign.subject}
            </h1>
            <StatusBadge status={campaign.status} />
          </div>

          <div className="flex items-center gap-2 text-gray-400 shrink-0">
            <button className="p-1.5 hover:text-amber-500 rounded-lg transition" title="Star">
              <Star className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:text-rose-600 rounded-lg transition" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchCampaign(true)}
              disabled={refreshing}
              className="p-1.5 hover:text-gray-800 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sender Profile Row (Figma Design) */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
              {campaign.sender?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-gray-900">
                  {campaign.sender?.name || 'Sender'}
                </span>
                <span className="text-xs text-gray-400">
                  &lt;{campaign.sender?.fromEmail || 'sender@ethereal.email'}&gt;
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                to {campaign.totalCount} recipients
              </p>
            </div>
          </div>

          <div className="text-xs text-gray-400 shrink-0">
            {new Date(campaign.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>

        {/* Email Body Content (Figma Style) */}
        <div className="py-4 border-y border-gray-100 text-xs text-gray-800 font-sans leading-relaxed whitespace-pre-wrap">
          {campaign.body ? (
            <div dangerouslySetInnerHTML={{ __html: campaign.body }} />
          ) : (
            <p className="text-gray-400 italic">No content body provided</p>
          )}
        </div>

        {/* Delivery Progress Bar */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">
              Delivery Progress ({campaign.sentCount + campaign.failedCount} of{' '}
              {campaign.totalCount} processed)
            </span>
            <span className="font-bold text-emerald-700">{Math.round(sentPercentage)}%</span>
          </div>

          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${sentPercentage}%` }}
            />
            <div
              className="bg-rose-500 transition-all duration-500"
              style={{ width: `${failedPercentage}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1 text-center text-xs">
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-emerald-700 font-bold block text-base">
                {campaign.sentCount}
              </span>
              <span className="text-emerald-600 text-[11px]">Sent & Delivered</span>
            </div>
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
              <span className="text-blue-700 font-bold block text-base">
                {Math.max(0, pendingCount)}
              </span>
              <span className="text-blue-600 text-[11px]">Pending in BullMQ</span>
            </div>
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
              <span className="text-rose-700 font-bold block text-base">
                {campaign.failedCount}
              </span>
              <span className="text-rose-600 text-[11px]">Failed Attempts</span>
            </div>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs text-gray-600">
          <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl">
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">
              Start Time
            </span>
            <span className="font-medium text-gray-800 mt-1 block">
              {new Date(campaign.startAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl">
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">
              Delay Spacing
            </span>
            <span className="font-medium text-gray-800 mt-1 block">
              {campaign.delayBetweenEmailsMs / 1000}s
            </span>
          </div>

          <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl">
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">
              Hourly Limit
            </span>
            <span className="font-medium text-gray-800 mt-1 block">{campaign.hourlyLimit}/hr</span>
          </div>

          <div className="p-3 bg-gray-50/70 border border-gray-200 rounded-xl">
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">
              Total Leads
            </span>
            <span className="font-medium text-gray-800 mt-1 block">{campaign.totalCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
