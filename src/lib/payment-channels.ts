export const PAYMENT_CHANNELS = [
  { code: "QRIS_CUSTOM", label: "QRIS", logo: "https://assets.tokovoucher.id/2023/04/915e406841cd333f12e6cd2d29c59723.png" },
  { code: "GOPAY", label: "GoPay", logo: "https://assets.tokovoucher.id/2023/04/64fb349fefc6ce687700ea8724a37d19.png" },
  { code: "DANA", label: "DANA", logo: "https://assets.tokovoucher.id/2022/11/39dfa0a150297717e71239f0cd215f75.png" },
  { code: "OVOPUSH", label: "OVO", logo: "https://js.durianpay.id/assets/img_ovo.svg" },
  { code: "SHOPEEPAY", label: "ShopeePay", logo: "https://assets.tokovoucher.id/2022/11/9a8849fb68683ccaed7483d827d07b39.png" },
  { code: "LINKAJA", label: "LinkAja", logo: "https://assets.tokovoucher.id/2022/11/b951de09eee40c57a3b570ecf396f119.png" },
  { code: "BRIVA", label: "BRI Virtual Account", logo: "https://assets.tokovoucher.id/2022/11/065303bb0d98a0e72292e93b90045d18.png" },
  { code: "BCAVA", label: "BCA Virtual Account", logo: "https://assets.tokovoucher.id/2022/11/f16b7a44e94da7632dfc672b6dbcf525.png" },
  { code: "BNIVA", label: "BNI Virtual Account", logo: "https://assets.tokovoucher.id/2022/11/ce2ecb5af35f8ed39f3e3eced974a70c.png" },
  { code: "PERMATAVA", label: "Permata Virtual Account", logo: "https://upload.wikimedia.org/wikipedia/id/4/48/PermataBank_logo.svg" },
] as const;

export type PaymentChannelCode = (typeof PAYMENT_CHANNELS)[number]["code"];

export function isAllowedChannel(channel: string): channel is PaymentChannelCode {
  return PAYMENT_CHANNELS.some((c) => c.code === channel);
}
