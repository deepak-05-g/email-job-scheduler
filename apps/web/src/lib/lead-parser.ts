/**
 * Lead Parser Utility
 * Safe client-side parsing for CSV/TXT email lead lists.
 */

export const MAX_LEAD_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB guardrail
export const ALLOWED_LEAD_EXTENSIONS = ['.csv', '.txt'];

export interface LeadParseResult {
  fileName?: string;
  fileSize?: number;
  validEmails: string[];
  totalDetected: number;
  duplicatesRemoved: number;
  invalidEntries: number;
}

export interface FileParseResponse {
  success: boolean;
  result?: LeadParseResult;
  error?: string;
}

const EMAIL_STRICT_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/;
const EMAIL_FINDER_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9]+([.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}/g;

/**
 * Parses raw text or CSV content and extracts unique valid email addresses
 * while accurately counting duplicates and invalid candidate entries.
 */
export function parseRawLeadContent(
  content: string,
  fileName?: string,
  fileSize?: number
): LeadParseResult {
  if (!content || typeof content !== 'string') {
    return {
      fileName,
      fileSize,
      validEmails: [],
      totalDetected: 0,
      duplicatesRemoved: 0,
      invalidEntries: 0,
    };
  }

  // 1. Direct Regex pattern search (handles messy CSVs, quoted fields, arbitrary text columns)
  const regexMatches = content.match(EMAIL_FINDER_REGEX) || [];

  // 2. Tokenized check for calculating invalid tokens (lines/cells that attempted to be emails)
  const tokens = content
    .split(/[\r\n,;"\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  let invalidEntries = 0;
  for (const token of tokens) {
    // If token contains '@' or resembles an email attempt but fails regex
    if (token.includes('@') && !EMAIL_STRICT_REGEX.test(token)) {
      invalidEntries++;
    }
  }

  const seen = new Set<string>();
  const validEmails: string[] = [];
  let duplicatesRemoved = 0;

  for (const rawMatch of regexMatches) {
    const normalized = rawMatch.trim().toLowerCase();
    if (!EMAIL_STRICT_REGEX.test(normalized)) {
      invalidEntries++;
      continue;
    }

    if (seen.has(normalized)) {
      duplicatesRemoved++;
    } else {
      seen.add(normalized);
      validEmails.push(normalized);
    }
  }

  return {
    fileName,
    fileSize,
    validEmails,
    totalDetected: validEmails.length,
    duplicatesRemoved,
    invalidEntries,
  };
}

/**
 * Validates file constraints and parses .csv or .txt file content safely on the client.
 */
export async function parseLeadFile(file: File): Promise<FileParseResponse> {
  if (!file) {
    return { success: false, error: 'No file provided.' };
  }

  const nameLower = file.name.toLowerCase();
  const hasValidExt = ALLOWED_LEAD_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  if (!hasValidExt) {
    return {
      success: false,
      error: `Unsupported file format. Please upload a .csv or .txt file (received: ${file.name}).`,
    };
  }

  if (file.size > MAX_LEAD_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      success: false,
      error: `File is too large (${sizeMb} MB). Maximum supported file size is 5 MB.`,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          resolve({
            success: false,
            error: `File ${file.name} is empty.`,
          });
          return;
        }

        const parseResult = parseRawLeadContent(text, file.name, file.size);
        if (parseResult.validEmails.length === 0) {
          resolve({
            success: false,
            error: `No valid email addresses were detected in ${file.name}.`,
            result: parseResult,
          });
          return;
        }

        resolve({
          success: true,
          result: parseResult,
        });
      } catch (err) {
        resolve({
          success: false,
          error: `Error parsing file: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        success: false,
        error: `Failed to read file ${file.name}.`,
      });
    };

    reader.readAsText(file);
  });
}

/**
 * Combines manually entered emails and uploaded file emails into a single deduplicated list.
 */
export function combineLeadSources(
  manualTokens: string | string[],
  uploadedEmails: string[] = []
): {
  finalEmails: string[];
  totalCount: number;
  duplicatesRemoved: number;
  invalidEntries: number;
} {
  const manualRaw = Array.isArray(manualTokens) ? manualTokens.join('\n') : manualTokens;
  const manualParsed = parseRawLeadContent(manualRaw);

  const seen = new Set<string>();
  const finalEmails: string[] = [];
  let duplicateCount = 0;

  // Add uploaded emails first
  for (const email of uploadedEmails) {
    const norm = email.trim().toLowerCase();
    if (EMAIL_STRICT_REGEX.test(norm)) {
      if (!seen.has(norm)) {
        seen.add(norm);
        finalEmails.push(norm);
      }
    }
  }

  // Add manual emails
  for (const email of manualParsed.validEmails) {
    const norm = email.trim().toLowerCase();
    if (seen.has(norm)) {
      duplicateCount++;
    } else {
      seen.add(norm);
      finalEmails.push(norm);
    }
  }

  return {
    finalEmails,
    totalCount: finalEmails.length,
    duplicatesRemoved: manualParsed.duplicatesRemoved + duplicateCount,
    invalidEntries: manualParsed.invalidEntries,
  };
}
