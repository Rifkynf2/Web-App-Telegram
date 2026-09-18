// public/js/rnfshop/import.js
// Logic aligned 100% with Dashboard_RNF_SHOP reference parser

const APP_ALIAS_MAP = {
    CHATGPT: "CHATGPT",
    "CHAT GPT": "CHATGPT",
    "CHATGPT PLUS": "CHATGPT",
};

function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value) {
    return normalizeSpaces(value).toUpperCase();
}

function parseGrossAmount(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? Number(digits) : 0;
}

function parsePaidDate(value) {
    const datePart = String(value || "").split("|")[0].trim();
    const match = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "";
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
}

const PRICE_STEP = 500;

function computeGrossFromNet(net) {
    return net + Math.ceil(net * 0.007) + 300;
}

function roundToPriceStep(value) {
    return Math.round(value / PRICE_STEP) * PRICE_STEP;
}

function reverseFeeToNet(gross) {
    if (!gross) return 0;

    // Balance ("saldo") payments have no fee, so the amount is already a
    // round product price. QRIS payments add a fee that never lands back
    // on a round multiple of PRICE_STEP, so this reliably tells them apart.
    if (gross % PRICE_STEP === 0) return gross;

    let low = 0;
    let high = gross;
    let bestNet = 0;
    let bestDiff = Number.POSITIVE_INFINITY;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const computed = computeGrossFromNet(mid);
        if (computed === gross) {
            bestNet = mid;
            bestDiff = 0;
            break;
        }

        const diff = Math.abs(computed - gross);
        if (diff < bestDiff) {
            bestDiff = diff;
            bestNet = mid;
        }

        if (computed < gross) low = mid + 1;
        else high = mid - 1;
    }

    // Product prices are always round multiples of PRICE_STEP; snap the
    // decoded net amount so leftover fee cents never leak into it.
    return roundToPriceStep(bestNet);
}

export function resolveNetAndFee(totalPayment, feeText, paymentMethod) {
    const gross = parseGrossAmount(totalPayment);
    const rawFee = feeText ? parseGrossAmount(feeText) : 0;
    const method = normalizeKey(paymentMethod);

    // Case 1: Explicit fee is present in the receipt
    if (rawFee > 0 && gross >= rawFee) {
        return {
            amount: gross - rawFee,
            fee: rawFee,
            grossAmount: gross,
            source: "explicit_fee"
        };
    }

    // Case 2: Payment method explicitly says Saldo (no fee)
    if (method === "SALDO") {
        return {
            amount: gross,
            fee: 0,
            grossAmount: gross,
            source: "saldo_no_fee"
        };
    }

    // Case 3: Legacy QRIS receipt without explicit Fee line (fallback)
    if (method === "QRIS" || (gross > 0 && gross % PRICE_STEP !== 0)) {
        const net = reverseFeeToNet(gross);
        return {
            amount: net,
            fee: Math.max(0, gross - net),
            grossAmount: gross,
            source: "legacy_reverse_math"
        };
    }

    // Case 4: Default fallback
    return {
        amount: gross,
        fee: 0,
        grossAmount: gross,
        source: "default"
    };
}

function splitBlocks(rawText) {
    const text = String(rawText || "").replace(/\r/g, "").trim();
    if (!text) return [];

    if (/TRANSAKSI SUKSES/i.test(text)) {
        const matches = text.match(/(?:[✅✔✓]?\s*)?TRANSAKSI SUKSES[\s\S]*?(?=(?:[✅✔✓]?\s*)?TRANSAKSI SUKSES|$)/gi);
        return (matches || []).map((block) => block.trim()).filter(Boolean);
    }

    return text
        .split(/\n\s*\n(?=.+?:)/)
        .map((block) => block.trim())
        .filter(Boolean);
}

function extractLineValue(block, label) {
    const pattern = new RegExp(
        `^(?:[\\s\\u2502\\u250a\\u256d\\u256e\\u2570\\u256f\\-]*)${label}\\s*:\\s*(.+)$`,
        "gim"
    );
    const match = pattern.exec(block);
    return normalizeSpaces(match?.[1] || "");
}

function resolveApp(productName, apps) {
    const lookup = new Map();
    (apps || []).forEach((app) => {
        lookup.set(normalizeKey(app.name), app);
    });

    const normalizedProduct = normalizeKey(productName);
    if (!normalizedProduct) return null;

    const exactMatch = lookup.get(normalizedProduct);
    if (exactMatch) return exactMatch;

    const aliasTarget = APP_ALIAS_MAP[normalizedProduct];
    if (!aliasTarget) return null;

    return lookup.get(normalizeKey(aliasTarget)) || null;
}

function parseBlock(block, index, apps) {
    const customerId = extractLineValue(block, "ID");
    const productName = extractLineValue(block, "Produk");
    const variation = extractLineValue(block, "Variasi");
    const qtyRaw = extractLineValue(block, "(?:Jumlah(?:\\s+Pesanan)?|Qty)");
    const totalPayment = extractLineValue(block, "Total Pembayaran");
    const feeText = extractLineValue(block, "Fee(?:\\s+QRIS)?");
    const paymentMethod = extractLineValue(block, "Metode Pembayaran");
    const paidAt = extractLineValue(block, "Dibayar");

    const trxDate = parsePaidDate(paidAt);
    const { amount, fee, grossAmount, source } = resolveNetAndFee(totalPayment, feeText, paymentMethod);
    const app = resolveApp(productName, apps);

    const qtyDigits = String(qtyRaw || "").replace(/\D/g, "");
    const qty = qtyDigits ? Number(qtyDigits) : 0;
    let note = variation || "";
    if (variation && qty > 0) {
        note = `${variation} (${qty} pcs)`;
    } else if (qty > 0) {
        note = `${qty} pcs`;
    }

    let status = "Ready";
    let statusKey = "ready";

    if (!customerId || !productName || !trxDate || !grossAmount || !amount) {
        status = "Invalid Format";
        statusKey = "invalid";
    } else if (!app) {
        status = "Unknown App";
        statusKey = "unknown";
    }

    return {
        rowId: `raw-import-${index + 1}`,
        rawBlock: block,
        trx_date: trxDate,
        trx_type: "incoming",
        amount,
        fee,
        gross_amount: grossAmount,
        payment_method: paymentMethod || "",
        customer_name: customerId,
        app_id: app?.id || "",
        app_name: app?.name || productName || "-",
        note,
        status,
        statusKey,
        isReady: statusKey === "ready",
        feeSource: source
    };
}

export function buildImportPreview(rawText, apps) {
    const blocks = splitBlocks(rawText);
    const rows = blocks.map((block, index) => parseBlock(block, index, apps));

    const summary = {
        total: blocks.length,
        ready: rows.filter((row) => row.statusKey === "ready").length,
        invalid: rows.filter((row) => row.statusKey === "invalid").length,
        unknown: rows.filter((row) => row.statusKey === "unknown").length,
    };

    return { rows, summary };
}

// Backwards compatibility alias for parseReceiptText
export function parseReceiptText(rawText, apps) {
    return buildImportPreview(rawText, apps);
}
