# Duplicate Scenario: Case Differences

## Scenario ID: DUP-002-05

## Expected Outcome: Existing Property Updated (No new data, if parser normalizes case)

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
Community: semi gated
Location: Kasavanahalli
Society/Landmark: Sobha Dream Acres
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

