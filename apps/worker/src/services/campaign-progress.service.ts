import { prisma, CampaignStatus } from '@email-scheduler/db';

export class CampaignProgressService {
  /**
   * Atomically records a successfully sent email and updates campaign status.
   */
  async recordEmailSent(campaignId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          sentCount: { increment: 1 },
        },
      });

      const newStatus = this.determineCampaignStatus(
        campaign.totalCount,
        campaign.sentCount,
        campaign.failedCount,
        campaign.status
      );

      if (newStatus !== campaign.status) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: { status: newStatus },
        });
      }
    });
  }

  /**
   * Atomically records a permanently failed email and updates campaign status.
   */
  async recordEmailFailed(campaignId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          failedCount: { increment: 1 },
        },
      });

      const newStatus = this.determineCampaignStatus(
        campaign.totalCount,
        campaign.sentCount,
        campaign.failedCount,
        campaign.status
      );

      if (newStatus !== campaign.status) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: { status: newStatus },
        });
      }
    });
  }

  /**
   * Marks campaign as PROCESSING if it is currently in SCHEDULED state.
   */
  async markCampaignProcessing(campaignId: string): Promise<void> {
    await prisma.campaign.updateMany({
      where: {
        id: campaignId,
        status: 'SCHEDULED',
      },
      data: {
        status: 'PROCESSING',
      },
    });
  }

  /**
   * Pure state machine for campaign status determination.
   */
  determineCampaignStatus(
    totalCount: number,
    sentCount: number,
    failedCount: number,
    currentStatus: CampaignStatus
  ): CampaignStatus {
    if (currentStatus === 'CANCELLED') {
      return 'CANCELLED';
    }

    const processedCount = sentCount + failedCount;

    if (processedCount >= totalCount) {
      if (failedCount === 0) {
        return 'COMPLETED';
      }
      if (sentCount > 0 && failedCount > 0) {
        return 'PARTIAL';
      }
      if (sentCount === 0 && failedCount === totalCount) {
        return 'FAILED';
      }
    }

    return 'PROCESSING';
  }
}

export const campaignProgressService = new CampaignProgressService();
