# Duplicate Scenario: Location Typo

## Scenario ID: DUP-002-03

## Expected Outcome: New Property (if parser cannot normalize) or Existing Property Updated (if parser normalizes)

### Message 1 (Base Property)

```
**Furnished** Fully Furnished
**BHK** 2 BHK
**Bathrooms** 2
**Balcony** 2 Balcony
Rent: 45000
Maintenance: 3000
Deposit: 2L
Sq.ft: 1300
Floor: 12th
Available From: July 15
Preferred Tenant: Anyone
Pets: not Allowed
Community: Semi Gated
Location: Kasavanahalli
Society/Landmark: Sobha Dream Acres
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

### Message 2 (Potential Duplicate)

```
**Furnished** Fully Furnished
**BHK** 2 BHK
**Bathrooms** 2
**Balcony** 2 Balcony
Rent: 45000
Maintenance: 3000
Deposit: 2L
Sq.ft: 1300
Floor: 12th
Available From: July 15
Preferred Tenant: Anyone
Pets: not Allowed
Community: Semi Gated
Location: Kasavanahallu
Society/Landmark: Sobha Dream Acres
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

