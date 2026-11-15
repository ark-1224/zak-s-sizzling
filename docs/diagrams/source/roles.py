"""Which role each wireframe belongs to, for the role tag on the frame and the README sections.

Each screen goes under the role that mainly uses it and is drawn as that role sees it (its
sidebar, buttons and figures). The Administrator can open every Staff screen too.
"""

CUSTOMER = ["01", "02", "03", "03b", "03c", "03d", "04", "05", "05b", "06", "07", "07b", "07c", "07d", "08", "08b", "09", "09b", "24"]
STAFF = ["10", "10b", "10c", "11b", "14l", "14b", "14e", "14f", "13b", "14g", "14j", "14m",
         "18", "18b", "19", "19b", "19c", "19d", "19e", "19f", "19g"]
ADMIN = ["11", "12", "12b", "12c", "12e", "12d", "22", "14", "14c", "14h", "14i", "14d", "14k", "25", "25b", "25c", "25d",
         "16", "16b", "17", "17b", "23", "20", "20b", "20c", "20d", "21", "21b"]

SECTIONS = [
    ("Customer", CUSTOMER, "The kiosk (touchscreen or a phone opened from the QR code) and the order status board at the counter. "
                           "Customers have no account and never sign in."),
    ("Staff", STAFF, "Front-desk and kitchen staff, signed in with a Staff account: sign-in, the dashboard, stock (adjusting, "
                     "the stock count), the kitchen display and the counter's point of sale. Drawn as Staff see them, with the Staff menu; "
                     "the Administrator can open every one of these too, with the full menu."),
    ("Administrator", ADMIN, "The owner, signed in with an Administrator account: products and recipes, raw materials, market purchases, "
                             "bulk import, analytics, transactions, user accounts and the kiosk QR code. Drawn with the full menu."),
]

# Screens drawn for one role that the other role also opens, in a different form.
COUNTERPART = {"11": "11b", "11b": "11", "14": "14l", "14l": "14", "14k": "14m", "14m": "14k"}

for _, numbers, _ in SECTIONS:
    assert len(numbers) == len(set(numbers))
_all = CUSTOMER + STAFF + ADMIN
assert len(_all) == len(set(_all)), "a screen is in two sections"


def section_of(number):
    for name, numbers, _ in SECTIONS:
        if number in numbers:
            return name
    raise KeyError(number)


def tag(number):
    """The role tag drawn at the top right of a wireframe."""
    role = section_of(number)
    other = COUNTERPART.get(number)
    if role == "Customer":
        return "CUSTOMER"
    if number in ("10", "10b", "10c"):
        return "STAFF  ·  the Administrator signs in here too"
    if role == "Staff":
        return f"STAFF VIEW  ·  Administrator's version: {other}" if other else "STAFF  ·  the Administrator can open it too"
    return f"ADMINISTRATOR VIEW  ·  Staff version: {other}" if other else "ADMINISTRATOR"
