import React from 'react';

// ─── Data Contract ──────────────────────────────────────────────
export interface PiPdfCompany {
  name: string;
  address: string;
  phone: string;
  website: string;
  bankName: string;
  bankAccount: string;
  npwp: string;
}

export interface PiPdfInvoice {
  number: string;
  date: string;
  currency: string;
  soNumber: string;
  customerPoNumber: string;
  term: string;
  amountInWords: string;
}

export interface PiPdfCustomer {
  companyName: string;
  picName: string;
  address: string;
}

export interface PiPdfItem {
  no: number;
  code: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  discount: number;
  subtotal: number;
  taxPercent: string;
}

export interface PiPdfSummary {
  dpp: number;
  dppPengganti: number;
  tax: number;
  deliveryFee: number;
  subTotal: number;
  stampDuty: number;
  downPayment: number;
  dpPercent?: number;
  balance: number;
}

export interface PiPdfSignatory {
  name: string | null;
  position: string;
  signatureUrl: string | null;
  isApproved: boolean;
}

export interface PiPdfData {
  company: PiPdfCompany;
  invoice: PiPdfInvoice;
  customer: PiPdfCustomer;
  items: PiPdfItem[];
  summary: PiPdfSummary;
  signatory: PiPdfSignatory;
  /** Optional note rendered under the "Keterangan Pembayaran" box (e.g. termin description). */
  paymentNote?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

const CORP_GREEN = '#0b8a47';
const CORP_GREEN_LIGHT = '#eef7f2';
const BORDER = '#7d7d7d';
const TEXT = '#222';

// ─── Layout Constants ───────────────────────────────────────────
const PAGE_WIDTH = '210mm';
const PAGE_HEIGHT = '297mm';

const PAGE_PADDING_TOP = '14mm';
const PAGE_PADDING_LEFT = '13mm';
const PAGE_PADDING_RIGHT = '18mm';
const PAGE_PADDING_BOTTOM = '14mm';

const HEADER_TOP_OFFSET = '26px';
const TITLE_WIDTH_MM = 65;

interface PiPdfTemplateProps {
  data: PiPdfData;
}

const PiPdfTemplateCompact = React.forwardRef<HTMLDivElement, PiPdfTemplateProps>(({ data }, ref) => {
  const { company, invoice, customer, items, summary, signatory, paymentNote } = data;

  const infoLabel: React.CSSProperties = {
    width: '20mm',
    padding: '0.45mm 0',
    verticalAlign: 'top',
    fontSize: '3.1mm',
    lineHeight: '1.42',
    fontWeight: 400,
    color: '#333',
  };

  const infoColon: React.CSSProperties = {
    width: '3.6mm',
    padding: '0.45mm 0',
    textAlign: 'center',
    verticalAlign: 'top',
    fontSize: '3.1mm',
    lineHeight: '1.42',
  };

  const infoValue: React.CSSProperties = {
    padding: '0.45mm 0',
    verticalAlign: 'top',
    fontSize: '3.1mm',
    lineHeight: '1.42',
    fontWeight: 700,
    color: TEXT,
  };

  const headerColumns = [
    { label: 'No', w: '6%' },
    { label: 'Kode', w: '12%' },
    { label: 'Nama Barang', w: '38%' },
    { label: 'Jumlah', w: '8%' },
    { label: 'Unit', w: '8%' },
    { label: 'Harga', w: '11%' },
    { label: 'Disc.', w: '7%' },
    { label: 'Sub Total', w: '13%' },
    { label: 'Pajak', w: '7%' },
  ];

  const thStyle: React.CSSProperties = {
    backgroundColor: CORP_GREEN,
    color: '#fff',
    border: `0.28mm solid ${BORDER}`,
    padding: '1.55mm 1.2mm',
    fontSize: '2.95mm',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    textAlign: 'center',
    verticalAlign: 'middle',
    WebkitPrintColorAdjust: 'exact' as any,
    printColorAdjust: 'exact' as any,
  };

  const tdBase: React.CSSProperties = {
    border: `0.28mm solid ${BORDER}`,
    padding: '1.55mm 1.2mm',
    fontSize: '3.0mm',
    verticalAlign: 'middle',
    color: TEXT,
  };

  const renderTableHeader = () => (
    <thead>
      <tr>
        {headerColumns.map((h) => (
          <th key={h.label} style={{ ...thStyle, width: h.w }}>
            {h.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderTableRow = (item: PiPdfItem, idx: number) => (
    <tr
      key={`${item.no}-${idx}`}
      style={{
        backgroundColor: idx % 2 === 1 ? CORP_GREEN_LIGHT : 'transparent',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.no}</td>
      <td style={{ ...tdBase, color: TEXT, fontWeight: 700 }}>{item.code}</td>
      <td style={{ ...tdBase, wordBreak: 'break-word', lineHeight: '1.28' }}>{item.name}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.qty}</td>
      <td style={{ ...tdBase, textAlign: 'center' }}>{item.unit}</td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
      <td style={{ ...tdBase, textAlign: 'center', whiteSpace: 'nowrap' }}>
        {item.discount > 0 ? `${item.discount.toFixed(2)}` : '-'}
      </td>
      <td style={{ ...tdBase, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
        {fmt(item.subtotal)}
      </td>
      <td style={{ ...tdBase, textAlign: 'center', whiteSpace: 'nowrap' }}>{item.taxPercent}</td>
    </tr>
  );

  const summaryRowsTop = [
    { label: 'DPP', value: fmt(summary.dpp) },
    { label: 'DPP Pengganti', value: fmt(summary.dppPengganti) },
    { label: 'Pajak', value: fmt(summary.tax) },
    { label: 'Biaya Pengantaran', value: fmt(summary.deliveryFee) },
  ];

  const itemCount = items.length;
  // Spacer kondisional: item sedikit → jarak sedang, item banyak → jarak minimal
  // maxHeight mencegah spacer mendorong footer ke page 2
  const spacerMaxHeight =
    itemCount <= 1 ? '80mm' :
    itemCount <= 2 ? '55mm' :
    itemCount <= 3 ? '35mm' :
    itemCount <= 5 ? '15mm' :
    '3mm';
  const spacerMinHeight =
    itemCount <= 1 ? '2mm' :
    itemCount <= 3 ? '1.5mm' :
    '0.5mm';

  return (
    <div ref={ref}>
      <div
        data-pdf-root
        data-pdf-section
        style={{
          width: PAGE_WIDTH,
          minHeight: PAGE_HEIGHT,
          margin: '0 auto',
          paddingTop: PAGE_PADDING_TOP,
          paddingLeft: PAGE_PADDING_LEFT,
          paddingRight: PAGE_PADDING_RIGHT,
          paddingBottom: PAGE_PADDING_BOTTOM,
          boxSizing: 'border-box',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '12px',
          color: TEXT,
          lineHeight: 1.35,
          background: 'transparent',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: `calc(${PAGE_HEIGHT} - ${PAGE_PADDING_TOP} - ${PAGE_PADDING_BOTTOM})`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* HEADER */}
          <div style={{ paddingTop: HEADER_TOP_OFFSET }}>
            <div
              style={{
                marginBottom: '5.5mm',
                textAlign: 'right',
                paddingRight: '6mm',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  marginBottom: '3mm',
                  fontSize: '6.2mm',
                  lineHeight: 1.0,
                  fontWeight: 700,
                  fontStyle: 'italic',
                  letterSpacing: '0.05px',
                  textTransform: 'uppercase',
                  color: '#111',
                  fontFamily: 'Georgia, "Times New Roman", Times, serif',
                  whiteSpace: 'nowrap',
                }}
              >
                PROFORMA INVOICE
              </h1>
              <div style={{ borderTop: '0.65mm solid #222' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                columnGap: '12mm',
                marginBottom: '5.5mm',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={infoLabel}>Nomor PI</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{invoice.number}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Kepada</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{customer.companyName}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Up.</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{customer.picName}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Alamat</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{customer.address}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={infoLabel}>Tanggal</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{invoice.date}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Mata Uang</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{invoice.currency}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Nomor SO</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{invoice.soNumber}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>PO Cust.</td>
                    <td style={infoColon}>:</td>
                    <td style={infoValue}>{invoice.customerPoNumber}</td>
                  </tr>
                  <tr>
                    <td style={infoLabel}>Term</td>
                    <td style={infoColon}>:</td>
                    <td style={{ ...infoValue, color: '#c62828', fontWeight: 800 }}>{invoice.term}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ITEM TABLE */}
            <div style={{ marginTop: '1mm' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {renderTableHeader()}
                <tbody>{items.map((item, idx) => renderTableRow(item, idx))}</tbody>
              </table>
            </div>
          </div>

          {/* SPACER FLEKSIBEL */}
          <div
            style={{
              flex: '1 1 auto',
              minHeight: spacerMinHeight,
              maxHeight: spacerMaxHeight,
            }}
          />

          {/* BOTTOM SECTION */}
          <div
            style={{
              breakInside: 'avoid' as any,
              pageBreakInside: 'avoid',
            }}
          >
            <div style={{ borderTop: '0.65mm solid #222', width: '100%', marginBottom: '3.5mm' }} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.03fr 0.97fr',
                columnGap: '10mm',
                alignItems: 'start',
              }}
            >
              {/* LEFT */}
              <div
                style={{
                  breakInside: 'avoid' as any,
                  pageBreakInside: 'avoid',
                }}
              >
                <div
                  style={{
                    background: CORP_GREEN_LIGHT,
                    borderLeft: `0.9mm solid ${CORP_GREEN}`,
                    padding: '2.2mm 2.8mm',
                    marginBottom: '2.5mm',
                    fontSize: '3.0mm',
                    lineHeight: '1.42',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Terbilang: </span>
                  <span style={{ fontStyle: 'italic' }}>{invoice.amountInWords}</span>
                </div>

                <div
                  style={{
                    border: '0.28mm solid #9a9a9a',
                    padding: '2.7mm 3.2mm',
                    breakInside: 'avoid' as any,
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div
                    style={{
                      fontSize: '3.35mm',
                      fontWeight: 800,
                      marginBottom: '1.8mm',
                      textTransform: 'uppercase',
                      color: CORP_GREEN,
                    }}
                  >
                    Keterangan Pembayaran:
                  </div>

                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '3.0mm',
                      lineHeight: '1.45',
                    }}
                  >
                    <tbody>
                      {([
                        ['Account', company.name],
                        ['Bank', company.bankName],
                        ['No. Rekening', company.bankAccount],
                        ['NPWP', company.npwp],
                      ] as [string, string][]).map(([label, val]) => (
                        <tr key={label}>
                          <td style={{ width: '21mm', padding: '0.32mm 0', verticalAlign: 'top' }}>{label}</td>
                          <td style={{ width: '3.6mm', padding: '0.32mm 0', textAlign: 'center', verticalAlign: 'top' }}>
                            :
                          </td>
                          <td style={{ fontWeight: 700, padding: '0.32mm 0', verticalAlign: 'top' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {paymentNote && (
                  <div
                    style={{
                      marginTop: '2.2mm',
                      padding: '2mm 2.6mm',
                      borderLeft: `0.9mm solid ${CORP_GREEN}`,
                      background: CORP_GREEN_LIGHT,
                      fontSize: '2.95mm',
                      lineHeight: '1.4',
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact',
                      breakInside: 'avoid' as any,
                      pageBreakInside: 'avoid',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Note: </span>
                    <span>{paymentNote}</span>
                  </div>
                )}
              </div>

              {/* RIGHT */}
              <div
                style={{
                  width: '100%',
                  fontSize: '3.05mm',
                  breakInside: 'avoid' as any,
                  pageBreakInside: 'avoid',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-start',
                }}
              >
                {summaryRowsTop.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 3.6mm auto',
                      columnGap: '1.8mm',
                      padding: '0.95mm 0',
                      alignItems: 'baseline',
                    }}
                  >
                    <div>{row.label}</div>
                    <div style={{ textAlign: 'center' }}>:</div>
                    <div style={{ minWidth: '29mm', textAlign: 'right' }}>{row.value}</div>
                  </div>
                ))}

                <div style={{ borderTop: '0.28mm solid #888', margin: '1mm 0' }} />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 3.6mm auto',
                    columnGap: '1.8mm',
                    padding: '0.95mm 0',
                    alignItems: 'baseline',
                    fontWeight: 800,
                  }}
                >
                  <div>Sub Total</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '29mm', textAlign: 'right' }}>Rp {fmt(summary.subTotal)}</div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 3.6mm auto',
                    columnGap: '1.8mm',
                    padding: '0.95mm 0',
                    alignItems: 'baseline',
                  }}
                >
                  <div>Bea Materai</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '29mm', textAlign: 'right' }}>Rp {fmt(summary.stampDuty)}</div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 3.6mm auto',
                    columnGap: '1.8mm',
                    padding: '0.95mm 0',
                    alignItems: 'baseline',
                  }}
                >
                  <div>Down Payment</div>
                  <div style={{ textAlign: 'center' }}>:</div>
                  <div style={{ minWidth: '29mm', textAlign: 'right' }}>
                    {summary.downPayment > 0 ? `Rp ${fmt(summary.downPayment)}` : '-'}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 3.6mm auto',
                    columnGap: '1.8mm',
                    alignItems: 'baseline',
                    paddingTop: '2.1mm',
                    paddingBottom: '2.1mm',
                    marginTop: '1.4mm',
                    borderTop: '0.65mm solid #222',
                    borderBottom: '0.65mm solid #222',
                  }}
                >
                  <div style={{ fontSize: '4.2mm', fontWeight: 800, color: TEXT }}>Saldo</div>
                  <div style={{ fontSize: '4.2mm', fontWeight: 800, color: TEXT, textAlign: 'center' }}>:</div>
                  <div
                    style={{
                      fontSize: '4.2mm',
                      fontWeight: 800,
                      color: TEXT,
                      textAlign: 'right',
                      minWidth: '29mm',
                    }}
                  >
                    Rp {fmt(summary.balance)}
                  </div>
                </div>

                {/* SIGNATURE */}
                <div
                  style={{
                    textAlign: 'center',
                    marginTop: '5mm',
                    breakInside: 'avoid' as any,
                    pageBreakInside: 'avoid',
                  }}
                >
                  <div style={{ fontSize: '3.35mm', fontWeight: 800, marginBottom: '2mm' }}>
                    {company.name}
                  </div>

                  <div
                    style={{
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 0 0.8mm 0',
                    }}
                  >
                    {signatory.isApproved && signatory.signatureUrl ? (
                      <img
                        src={signatory.signatureUrl}
                        alt="signature"
                        crossOrigin="anonymous"
                        style={{
                          maxHeight: '40px',
                          maxWidth: '120px',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <div style={{ height: '40px' }} />
                    )}
                  </div>

                  <div
                    style={{
                      width: '80%',
                      borderTop: '0.32mm solid #666',
                      margin: '0 auto 1.1mm auto',
                    }}
                  />

                  <div style={{ fontSize: '2.95mm', marginBottom: '0.35mm' }}>
                    {signatory.isApproved && signatory.name ? signatory.name : '(....................................)'}
                  </div>

                  <div
                    style={{
                      fontSize: '2.7mm',
                      fontWeight: 700,
                      letterSpacing: '0.25px',
                    }}
                  >
                    {signatory.position}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>
          {`
            @page {
              size: A4 portrait;
              margin: 0;
            }

            @media print {
              html, body {
                width: 210mm;
                height: 297mm;
                margin: 0;
                padding: 0;
              }

              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                box-sizing: border-box !important;
              }

              table, tr, td, th, img {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
          `}
        </style>
      </div>
    </div>
  );
});

PiPdfTemplateCompact.displayName = 'PiPdfTemplateCompact';
export default PiPdfTemplateCompact;
