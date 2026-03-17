import QRCode from 'qrcode'

export async function makeQrDataUrl(joinUrl: string) {
  return QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 320,
    color: {
      dark: '#112215',
      light: '#FFF8F1',
    },
  })
}
