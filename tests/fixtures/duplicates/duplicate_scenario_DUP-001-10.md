# Duplicate Scenario: Apartment Type Typo

## Scenario ID: DUP-001-10

## Expected Outcome: New Property (if parser cannot normalize) or Existing Property Updated (if parser normalizes)

### Message 1 (Base Property)

```
**Furnished** Semi Furnished
**BHK** 2 BHK
**Bathrooms** 2
**Balcony** 2 Balcony
Rent: 50000
Maintenance: included
Deposit: 2L
Sq.ft: 1200
Floor: 5th
Available From: July 15
Preferred Tenant: Anyone
Pets: allowed
Community: Gated Community
Location: Harlur
Society/Landmark: Sobha Dream Acres
Google Maps Link: https://maps.app.goo.gl/oQCKEG435u8Fp93U7
```

### Message 2 (Potential Duplicate)

```
**Furnished** Semi Furnished
**BHK** 2 BHK
**Bathrooms** 2
**Balcony** 2 Balcony
Rent: 50000
Maintenance: included
Deposit: 2L
Sq.ft: 1200
Floor: 5th
Available From: July 15
Preferred Tenant: Anyone
Pets: allowed
Community: Gated Community (Typo)
Location: Harlur
Society/Landmark: Sobha Dream Acres
Google Maps Link: https://maps.app.goo.gl/oQCKEG435u8Fp93U7
```

