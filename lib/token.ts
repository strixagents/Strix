/**
 * The official Strix token. Leave OFFICIAL_CA empty until the token is launched —
 * the landing page then shows its normal announcement bar instead of the contract address.
 */
export const OFFICIAL_CA = "0x676c93667db12dc5d595372f9a2efe27672cb595";

export const EXPLORER_TOKEN = (ca: string) => `https://robinhoodchain.blockscout.com/token/${ca}`;
