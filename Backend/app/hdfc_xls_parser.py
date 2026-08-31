from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import xlrd


def normalize_merchant_name(description: str | None) -> str:
    if not description:
        return ""
    cleaned = re.sub(r"[^A-Za-z0-9\s]", " ", description)
    return " ".join(cleaned.upper().split())


def parse_date_value(date_raw: Any, datemode: int = 0) -> datetime:
    """
    Parses date from string (e.g. DD/MM/YY or DD/MM/YYYY) or xlrd numeric date float.
    Returns timezone-aware UTC datetime.
    """
    if isinstance(date_raw, (int, float)):
        # Excel date serial number
        try:
            year, month, day, hour, minute, second = xlrd.xldate_as_tuple(date_raw, datemode)
            return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
        except Exception:
            pass

    date_str = str(date_raw).strip()
    if not date_str:
        raise ValueError("Date is empty.")

    # Supported HDFC statement formats: DD/MM/YY or DD/MM/YYYY
    for fmt in ("%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y"):
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    raise ValueError(f"Unsupported date format: '{date_str}'")


def parse_hdfc_xls(file_bytes: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Parses a native HDFC Bank Excel 97-2004 (.xls / BIFF8) account statement.
    Returns a tuple of (validated_rows, errors).
    """
    errors: list[dict[str, Any]] = []
    validated_rows: list[dict[str, Any]] = []

    try:
        workbook = xlrd.open_workbook(file_contents=file_bytes)
    except Exception:
        errors.append({"row": 1, "message": "Failed to open Excel file. Ensure it is a valid .xls workbook."})
        return [], errors

    if workbook.nsheets == 0:
        errors.append({"row": 1, "message": "Workbook contains no sheets."})
        return [], errors

    sheet = workbook.sheet_by_index(0)

    # 1. Dynamically locate the transaction table header row
    header_row_idx: int | None = None
    col_map: dict[str, int] = {}

    for r in range(min(sheet.nrows, 50)):
        row_values = [str(sheet.cell_value(r, c)).strip().lower() for c in range(sheet.ncols)]
        if any("date" in val for val in row_values) and any("narration" in val for val in row_values):
            # Check for withdrawal and deposit columns
            has_withdrawal = any("withdrawal" in val for val in row_values)
            has_deposit = any("deposit" in val for val in row_values)
            if has_withdrawal and has_deposit:
                header_row_idx = r
                for c in range(sheet.ncols):
                    val = str(sheet.cell_value(r, c)).strip().lower()
                    if val == "date" or "date" in val and "value" not in val:
                        col_map["date"] = c
                    elif "narration" in val or "description" in val:
                        col_map["narration"] = c
                    elif "withdrawal" in val:
                        col_map["withdrawal"] = c
                    elif "deposit" in val:
                        col_map["deposit"] = c
                    elif "closing balance" in val or "balance" in val:
                        col_map["balance"] = c
                break

    if header_row_idx is None or "date" not in col_map or "narration" not in col_map or "withdrawal" not in col_map or "deposit" not in col_map:
        errors.append({
            "row": 1,
            "message": "HDFC statement transaction headers not found. Required columns: Date, Narration, Withdrawal Amt., Deposit Amt.",
        })
        return [], errors

    date_col = col_map["date"]
    desc_col = col_map["narration"]
    withdrawal_col = col_map["withdrawal"]
    deposit_col = col_map["deposit"]

    # 2. Iterate transaction rows
    for r in range(header_row_idx + 1, sheet.nrows):
        excel_row_num = r + 1

        date_raw = sheet.cell_value(r, date_col)
        desc_raw = sheet.cell_value(r, desc_col)

        date_str = str(date_raw).strip()
        desc_str = str(desc_raw).strip()

        # Stop conditions / summary markers
        if not date_str and not desc_str:
            continue
        if date_str.startswith("*") or desc_str.startswith("*"):
            continue
        lower_date = date_str.lower()
        lower_desc = desc_str.lower()

        if "statement summary" in lower_date or "statement summary" in lower_desc:
            break
        if "opening balance" in lower_date or "opening balance" in lower_desc:
            break
        if "closing bal" in lower_date or "closing bal" in lower_desc:
            break
        if "dr count" in lower_date or "cr count" in lower_date:
            break
        if "generated on" in lower_date or "generated on" in lower_desc:
            break
        if "end of statement" in lower_date or "end of statement" in lower_desc:
            break
        if "registered office address" in lower_date or "registered office address" in lower_desc:
            break

        # Validate Description
        if not desc_str:
            errors.append({"row": excel_row_num, "message": "Narration / description is required."})
            continue

        normalized_merchant = normalize_merchant_name(desc_str)
        if not normalized_merchant:
            errors.append({"row": excel_row_num, "message": "Description does not contain a valid merchant name."})
            continue

        # Parse Transaction Date
        try:
            transaction_date = parse_date_value(date_raw, datemode=workbook.datemode)
        except ValueError as e:
            errors.append({"row": excel_row_num, "message": f"Invalid date: {e}"})
            continue

        # Parse Withdrawal vs Deposit Amounts
        w_raw = sheet.cell_value(r, withdrawal_col)
        d_raw = sheet.cell_value(r, deposit_col)

        w_str = str(w_raw).strip() if w_raw != "" else ""
        d_str = str(d_raw).strip() if d_raw != "" else ""

        w_amount: Decimal | None = None
        d_amount: Decimal | None = None

        if w_str:
            try:
                val = Decimal(w_str)
                if val > 0:
                    w_amount = val
            except (InvalidOperation, ValueError):
                errors.append({"row": excel_row_num, "message": "Withdrawal amount is invalid."})
                continue

        if d_str:
            try:
                val = Decimal(d_str)
                if val > 0:
                    d_amount = val
            except (InvalidOperation, ValueError):
                errors.append({"row": excel_row_num, "message": "Deposit amount is invalid."})
                continue

        # Amount validation: exactly one of debit or credit must be populated
        if w_amount is not None and d_amount is not None:
            errors.append({"row": excel_row_num, "message": "Ambiguous row: both withdrawal and deposit amounts are populated."})
            continue

        if w_amount is None and d_amount is None:
            errors.append({"row": excel_row_num, "message": "Row must have either a withdrawal or deposit amount."})
            continue

        if w_amount is not None:
            amount = -abs(w_amount)
            tx_type = "debit"
        else:
            amount = abs(d_amount)  # type: ignore[arg-type]
            tx_type = "credit"

        if not amount.is_finite():
            errors.append({"row": excel_row_num, "message": "Amount must be finite."})
            continue

        validated_rows.append({
            "amount": amount,
            "currency": "INR",
            "description": desc_str,
            "merchant_name": normalized_merchant,
            "transaction_date": transaction_date,
            "transaction_type": tx_type,
        })

    return validated_rows, errors
