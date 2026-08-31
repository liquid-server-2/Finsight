from __future__ import annotations

import re
from decimal import Decimal

# Supported Standard Categories
SUPPORTED_CATEGORIES: list[str] = [
    "Income",
    "Food & Dining",
    "Transportation",
    "Entertainment",
    "Shopping",
    "Bills & Utilities",
    "Healthcare",
    "Travel",
    "Transfer",
    "Other",
]


def is_valid_category(category: str | None) -> bool:
    return bool(category and category.strip() in SUPPORTED_CATEGORIES)


# Deterministic Categorization Rules
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Income": [
        "SALARY",
        "PAYROLL",
        "STIPEND",
        "BONUS",
        "DIVIDEND",
        "INTEREST EARNED",
        "INTEREST PAID",
        "CASHBACK",
        "REFUND",
        "FREELANCE",
        "DIRECT DEPOSIT",
        "HONORARIUM",
    ],
    "Food & Dining": [
        "SWIGGY",
        "ZOMATO",
        "UBER EATS",
        "DOORDASH",
        "DOMINOS",
        "PIZZA",
        "MCDONALD",
        "KFC",
        "STARBUCKS",
        "CAFE",
        "COFFEE",
        "RESTAURANT",
        "DINER",
        "BAKERY",
        "BURGER",
        "SUBWAY",
        "DUNKIN",
        "FOOD",
        "BISTRO",
        "DHABA",
        "SWEETS",
        "EATERY",
    ],
    "Transportation": [
        "UBER",
        "OLA",
        "RAPIDO",
        "LYFT",
        "METRO",
        "SUBWAY",
        "TRAIN",
        "IRCTC",
        "BUS",
        "AUTO",
        "CAB",
        "TAXI",
        "TOLL",
        "FASTAG",
        "PARKING",
        "PETROL",
        "DIESEL",
        "FUEL",
        "SHELL",
        "IOCL",
        "BPCL",
        "HPCL",
        "TRANSIT",
    ],
    "Entertainment": [
        "NETFLIX",
        "SPOTIFY",
        "PRIME VIDEO",
        "HOTSTAR",
        "DISNEY",
        "YOUTUBE",
        "APPLE MUSIC",
        "HULU",
        "HBO",
        "CINEMA",
        "PVR",
        "INOX",
        "BOOKMYSHOW",
        "STEAM",
        "PLAYSTATION",
        "XBOX",
        "NINTENDO",
        "THEATRE",
        "MOVIES",
        "CONCERT",
    ],
    "Shopping": [
        "AMAZON",
        "FLIPKART",
        "MYNTRA",
        "AJIO",
        "MEESHO",
        "EBAY",
        "WALMART",
        "TARGET",
        "IKEA",
        "ZARA",
        "HM",
        "UNIQLO",
        "CLOTHING",
        "RETAIL",
        "SUPERMARKET",
        "GROCERY",
        "BLINKIT",
        "ZEPTO",
        "INSTAMART",
        "BIGBASKET",
        "DMART",
        "COSTCO",
        "STORE",
        "MALL",
    ],
    "Bills & Utilities": [
        "ELECTRICITY",
        "POWER",
        "WATER",
        "GAS",
        "BROADBAND",
        "INTERNET",
        "WIFI",
        "AIRTEL",
        "JIO",
        "VODAFONE",
        "VI BILL",
        "BSNL",
        "UTILITY",
        "MOBILE RECHARGE",
        "DTH",
        "TATA SKY",
        "SUN DIRECT",
        "INSURANCE",
        "PREMIUM",
        "LIC",
        "MAINTENANCE",
        "MUNICIPAL",
        "BILLPAY",
    ],
    "Healthcare": [
        "PHARMACY",
        "MEDICINE",
        "APOLLO",
        "PHARMEASY",
        "1MG",
        "NETMEDS",
        "HOSPITAL",
        "CLINIC",
        "DOCTOR",
        "DENTAL",
        "LABS",
        "DIAGNOSTICS",
        "HEALTH",
        "OPTICAL",
        "CARE",
        "MEDICOS",
    ],
    "Travel": [
        "AIRLINE",
        "AIRWAYS",
        "FLIGHT",
        "INDIGO",
        "AIR INDIA",
        "SPICEJET",
        "VISTARA",
        "EMIRATES",
        "HOTEL",
        "RESORT",
        "AIRBNB",
        "BOOKING COM",
        "BOOKINGCOM",
        "MAKEMYTRIP",
        "GOIBIBO",
        "EXPEDIA",
        "AGODA",
        "TRIP",
        "TOURISM",
        "STAY",
    ],
    "Transfer": [
        "TRANSFER",
        "NEFT",
        "RTGS",
        "IMPS",
        "UPI TRANSFER",
        "SELF TRANSFER",
        "WIRE",
        "ACH",
        "INTERNAL TRANSFER",
        "TO ACCOUNT",
        "WALLET TOPUP",
    ],
}


def normalize_text_for_categorization(text: str | None) -> str:
    if not text:
        return ""
    # Replace non-alphanumeric characters with spaces and uppercase
    cleaned = re.sub(r"[^A-Za-z0-9\s]", " ", text)
    return " ".join(cleaned.upper().split())


def categorize_transaction(
    description: str | None,
    transaction_type: str = "debit",
    amount: Decimal | float | None = None,
) -> str:
    """
    Deterministic rule-based transaction categorizer.
    Matches normalized descriptions against keyword rules.
    """
    normalized = normalize_text_for_categorization(description)
    if not normalized:
        if (
            transaction_type.lower() == "credit"
            and amount is not None
            and amount > 0
        ):
            return "Income"
        return "Other"

    # 1. Check Income keywords first
    for keyword in CATEGORY_KEYWORDS["Income"]:
        if keyword in normalized:
            return "Income"

    # 2. Check all other specific categories
    for category, keywords in CATEGORY_KEYWORDS.items():
        if category == "Income":
            continue
        for keyword in keywords:
            # Match either as standalone token or substring
            if keyword in normalized:
                return category

    # 3. If credit transaction with typical income context
    if (
        transaction_type.lower() == "credit"
        and amount is not None
        and amount > 0
    ):
        # If it wasn't recognized as a specific refund or transfer, but is a credit
        if any(term in normalized for term in ["CREDIT", "DEPOSIT", "SAL", "PAY"]):
            return "Income"

    # 4. Default fallback
    return "Other"
