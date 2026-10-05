export const RECEIPT_EXTRACTION_PROMPT = `You are a receipt parser. Extract structured data from this receipt image.

Return a JSON object with exactly this structure:
{
  "merchantName": "store name or null",
  "merchantAddress": "street, postal code and city printed on the receipt, or null",
  "date": "YYYY-MM-DD or null",
  "items": [
    { "name": "item description", "quantity": 1, "unitPrice": 499, "totalPrice": 499 }
  ],
  "subtotal": 1299,
  "tax": 104,
  "tip": 0,
  "total": 1403,
  "currency": "USD",
  "alternateTotals": [
    { "currency": "EUR", "total": 1287 }
  ]
}

CRITICAL RULES:
- All monetary values MUST be integers in cents (e.g., $12.99 = 1299)
- Every line item on the receipt must appear in the items array
- quantity * unitPrice should equal totalPrice for each item
- subtotal should equal the sum of all item totalPrices
- total should equal subtotal + tax + tip
- If the receipt prints its final total in one or more additional currencies,
  add each printed final total to alternateTotals. Do not infer or calculate
  alternate totals: only include a value that is explicitly printed.
- The primary total and currency are the receipt's local/original amount.
- If you cannot read a value clearly, make your best estimate
- Do not include any text outside the JSON object
- Return ONLY valid JSON, no markdown code fences`;
