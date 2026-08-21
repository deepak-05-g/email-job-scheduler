import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCampaign, ApiClientError } from '../lib/api-client.js';
import { useAuth } from '../hooks/useAuth.js';
import { parseLeadFile, combineLeadSources, LeadParseResult } from '../lib/lead-parser.js';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Upload,
  Calendar,
  Undo,
  Redo,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Quote,
  Flag,
  Link as LinkIcon,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
} from 'lucide-react';

export const CreateCampaignPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [manualRecipientInput, setManualRecipientInput] = useState<string>('');
  const [manualRecipientsList, setManualRecipientsList] = useState<string[]>([]);

  // Uploaded Lead State
  const [uploadResult, setUploadResult] = useState<LeadParseResult | null>(null);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Schedule & Throttling
  const [startAtLocal, setStartAtLocal] = useState<string>(() => {
    const d = new Date(Date.now() + 60000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [delaySeconds, setDelaySeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(100);

  // Popover State
  const [showSchedulePopover, setShowSchedulePopover] = useState<boolean>(false);

  // Submission State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ id: string; total: number } | null>(null);

  // Combined Recipients Calculation
  const combinedSummary = combineLeadSources(
    manualRecipientsList.concat(manualRecipientInput ? [manualRecipientInput] : []),
    uploadResult?.validEmails || []
  );

  // Add individual or pasted recipient from input field
  const handleAddManualRecipient = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!manualRecipientInput.trim()) return;

      const parsed = combineLeadSources(manualRecipientInput);
      if (parsed.finalEmails.length > 0) {
        setManualRecipientsList((prev) => Array.from(new Set([...prev, ...parsed.finalEmails])));
        setManualRecipientInput('');
      }
    }
  };

  // Handle CSV/TXT File Processing
  const handleFileProcess = async (file: File) => {
    if (!file) return;
    setError(null);
    setIsParsingFile(true);

    try {
      const response = await parseLeadFile(file);
      if (!response.success || !response.result) {
        setError(response.error || 'Failed to parse file.');
        setUploadResult(null);
      } else {
        setUploadResult(response.result);
      }
    } catch (err) {
      setError(`File read error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const removeManualRecipient = (indexToRemove: number) => {
    setManualRecipientsList((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const clearUploadedFile = () => {
    setUploadResult(null);
  };

  // Preset time selections
  const applyPresetTime = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setStartAtLocal(d.toISOString().slice(0, 16));
  };

  const handleScheduleSubmit = async () => {
    setError(null);

    const finalRecipients = combinedSummary.finalEmails;

    if (finalRecipients.length === 0) {
      setError('Please provide or upload at least one valid recipient email address.');
      return;
    }
    if (!subject.trim()) {
      setError('Email subject is required.');
      return;
    }
    if (!body.trim()) {
      setError('Email body is required.');
      return;
    }

    // Ensure startAt is at least now if user picked past time or instant dispatch
    const selectedTime = new Date(startAtLocal).getTime();
    const effectiveTime = isNaN(selectedTime) || selectedTime < Date.now() ? Date.now() : selectedTime;
    const startAtIso = new Date(effectiveTime).toISOString();
    const delayBetweenEmailsMs = Math.max(2000, Math.floor((delaySeconds || 2) * 1000));
    const effectiveHourlyLimit = Math.max(1, Math.floor(hourlyLimit || 100));

    setSubmitting(true);

    try {
      const response = await createCampaign({
        subject: subject.trim(),
        body: body.trim(),
        startAt: startAtIso,
        delayBetweenEmailsMs,
        hourlyLimit: effectiveHourlyLimit,
        recipients: finalRecipients,
      });

      setSuccessInfo({
        id: response.campaign.id,
        total: response.campaign.totalCount,
      });
      setShowSchedulePopover(false);

      setTimeout(() => {
        navigate(`/campaigns/${response.campaign.id}`);
      }, 1200);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = Array.isArray(err.details)
          ? err.details.map((d: any) => `${d.field}: ${d.message}`).join(' | ')
          : '';
        setError(details ? `${err.message} (${details})` : err.message);
      } else {
        setError('Failed to schedule campaign. Please check inputs and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`max-w-4xl mx-auto bg-white border rounded-2xl p-6 md:p-8 shadow-xs relative transition ${
        isDragging
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10'
          : 'border-gray-200/90'
      }`}
    >
      {/* Top Header Row (Figma Style) */}
      <div className="flex items-center justify-between pb-6 border-b border-gray-100 mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            Compose New Email
          </h1>
        </div>

        <div className="flex items-center gap-3 relative">
          {/* Attachment Icon */}
          <div className="flex items-center text-gray-500 text-xs font-medium gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg">
            <Paperclip className="w-4 h-4 text-emerald-600" />
            <span>{uploadResult ? '1 file' : '0'}</span>
          </div>

          {/* Clock Icon (Toggle Schedule Popover) */}
          <button
            type="button"
            onClick={() => setShowSchedulePopover(!showSchedulePopover)}
            className="p-2 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-gray-200 transition"
            title="Schedule Settings"
          >
            <Clock className="w-4 h-4" />
          </button>

          {/* Primary Action (Send Later pill button) */}
          <button
            type="button"
            onClick={() => setShowSchedulePopover(true)}
            disabled={submitting || combinedSummary.totalCount === 0}
            className="px-5 py-2 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border-2 border-emerald-500 shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Scheduling...' : 'Send Later'}
          </button>

          {/* Send Later Popover (Figma Style dropdown) */}
          {showSchedulePopover && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 z-50">
              <h4 className="font-bold text-sm text-gray-900 mb-3">Send Later</h4>

              {/* Date & Time Picker */}
              <div className="relative mb-3">
                <input
                  type="datetime-local"
                  value={startAtLocal}
                  onChange={(e) => setStartAtLocal(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-emerald-500 transition"
                />
                <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-3" />
              </div>

              {/* Suggested Preset Times */}
              <div className="space-y-1 text-xs text-gray-600 mb-4">
                <button
                  type="button"
                  onClick={() => applyPresetTime(1)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 rounded-lg transition"
                >
                  In 1 hour
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTime(24)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 rounded-lg transition"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetTime(48)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 rounded-lg transition"
                >
                  In 2 days
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowSchedulePopover(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleScheduleSubmit}
                  disabled={submitting || combinedSummary.totalCount === 0}
                  className="px-4 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-500 shadow-2xs transition disabled:opacity-40"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successInfo && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Campaign scheduled successfully! Enqueued {successInfo.total} delayed email jobs into
            BullMQ.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Compose Fields */}
      <div className="space-y-4">
        {/* From Row */}
        <div className="flex items-center gap-4 py-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400 w-12 shrink-0">From</span>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-800">
            <span>{user?.email || 'hosea32@ethereal.email'}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </div>
        </div>

        {/* To Row */}
        <div className="flex items-start gap-4 py-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400 w-12 shrink-0 pt-1.5">To</span>
          <div className="flex-1 flex flex-wrap items-center gap-1.5">
            {/* Recipient Chips (Figma style green pills) */}
            {combinedSummary.finalEmails.slice(0, 4).map((email, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-400/60 rounded-full text-xs font-medium text-emerald-800"
              >
                {email}
                <button
                  type="button"
                  onClick={() => removeManualRecipient(idx)}
                  className="hover:text-emerald-950"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {combinedSummary.finalEmails.length > 4 && (
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-300 rounded-full text-xs font-semibold text-emerald-800">
                +{combinedSummary.finalEmails.length - 4} more
              </span>
            )}

            <input
              type="text"
              value={manualRecipientInput}
              onChange={(e) => setManualRecipientInput(e.target.value)}
              onKeyDown={handleAddManualRecipient}
              placeholder={
                combinedSummary.finalEmails.length === 0
                  ? 'recipient@example.com (Type & press Enter, paste, or upload CSV/TXT)'
                  : ''
              }
              className="flex-1 min-w-[220px] text-xs text-gray-800 placeholder-gray-400 bg-transparent py-1 focus:outline-none"
            />
          </div>

          {/* Upload List Action Button */}
          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileProcess(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingFile}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-400/50 shadow-2xs transition disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isParsingFile ? 'Parsing...' : 'Upload List'}</span>
            </button>
          </div>
        </div>

        {/* Uploaded File & Email Detection Summary Card (Task 2 Requirement) */}
        {uploadResult && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-emerald-50/70 border border-emerald-200/90 rounded-xl text-xs text-emerald-900 gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  Uploaded:{' '}
                  <span className="font-mono text-emerald-800">{uploadResult.fileName}</span>
                </p>
                <p className="text-[11px] text-emerald-700">
                  <strong className="text-emerald-800 font-bold">
                    {uploadResult.totalDetected} emails detected
                  </strong>
                  {uploadResult.duplicatesRemoved > 0 &&
                    ` • ${uploadResult.duplicatesRemoved} duplicates removed`}
                  {uploadResult.invalidEntries > 0 &&
                    ` • ${uploadResult.invalidEntries} invalid entries ignored`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearUploadedFile}
              className="self-end sm:self-auto text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2 py-1 rounded-lg transition"
            >
              Clear File
            </button>
          </div>
        )}

        {/* Subject Row */}
        <div className="flex items-center gap-4 py-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-400 w-12 shrink-0">Subject</span>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full text-xs text-gray-800 placeholder-gray-400 bg-transparent py-1 focus:outline-none"
          />
        </div>

        {/* Throttling Controls Row (Figma compact inputs) */}
        <div className="flex flex-wrap items-center gap-6 py-2 border-b border-gray-100 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span>Delay between 2 emails</span>
            <input
              type="number"
              min={2}
              max={3600}
              step={1}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(parseFloat(e.target.value) || 2)}
              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center font-medium text-gray-800 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-gray-400">sec</span>
          </div>

          <div className="flex items-center gap-2">
            <span>Hourly Limit</span>
            <input
              type="number"
              min={1}
              max={10000}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(parseInt(e.target.value, 10) || 100)}
              className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center font-medium text-gray-800 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-gray-400">/hr</span>
          </div>

          <div className="text-[11px] text-gray-400 ml-auto font-medium">
            Total Recipients:{' '}
            <span className="font-bold text-emerald-700">{combinedSummary.totalCount}</span>
          </div>
        </div>

        {/* Editor Box & Toolbar (Figma Style) */}
        <div className="bg-gray-50/50 border border-gray-200 rounded-2xl p-4 space-y-3">
          {/* Rich Editor Mock Toolbar */}
          <div className="flex flex-wrap items-center gap-1 pb-3 border-b border-gray-200/80 text-gray-500">
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Type className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Outdent className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Indent className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-gray-300 mx-1" />
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1.5 hover:bg-gray-200/70 rounded-md text-gray-600 transition"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Email Body Textarea */}
          <textarea
            required
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none resize-none font-sans leading-relaxed"
          />
        </div>
      </div>
    </div>
  );
};
