type AccountType = 'BUSINESS' | 'CREATOR' | 'PERSONAL' | string;

interface GraphApiResponse {
  id: string;
  username?: string;
  account_type?: AccountType;
  instagram_business_account?: { id: string };
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

export type ValidationResult =
  | {
      valid: true;
      igUserId: string;
      username: string;
      accountType: 'BUSINESS' | 'CREATOR';
    }
  | {
      valid: false;
      reason: 'personal_account' | 'no_facebook_page' | 'api_error';
      guidance?: string;
    };

export async function validateBusinessAccount(
  igUserId: string,
  accessToken: string,
): Promise<ValidationResult> {
  const url = new URL(`https://graph.facebook.com/v21.0/${igUserId}`);
  url.searchParams.set('fields', 'id,username,account_type,instagram_business_account');
  url.searchParams.set('access_token', accessToken);

  let data: GraphApiResponse;

  try {
    const response = await globalThis.fetch(url.toString());
    data = (await response.json()) as GraphApiResponse;
  } catch {
    return { valid: false, reason: 'api_error' };
  }

  if (data.error) {
    return { valid: false, reason: 'api_error' };
  }

  const accountType = data.account_type ?? '';

  if (accountType === 'BUSINESS' || accountType === 'CREATOR') {
    if (!data.instagram_business_account) {
      return {
        valid: false,
        reason: 'no_facebook_page',
      };
    }

    return {
      valid: true,
      igUserId: data.id,
      username: data.username ?? '',
      accountType: accountType as 'BUSINESS' | 'CREATOR',
    };
  }

  if (accountType === 'PERSONAL') {
    return {
      valid: false,
      reason: 'personal_account',
      guidance: 'IG 앱 → 설정 → 비즈니스/크리에이터 전환',
    };
  }

  return { valid: false, reason: 'api_error' };
}
