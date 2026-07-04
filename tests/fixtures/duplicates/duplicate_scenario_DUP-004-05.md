# Duplicate Scenario: Case Differences

## Scenario ID: DUP-004-05

## Expected Outcome: Existing Property Updated (No new data, if parser normalizes case)

### Message 1 (Base Property)

```
**Furnished** Semi Furnished
**BHK** 3 BHK
**Bathrooms** 2
**Balcony** 1 Balcony
Rent: 60000
Maintenance: included
Deposit: 1.5L
Sq.ft: 1300
Floor: 5th
Available From: July 15
Preferred Tenant: Family Only
Pets: allowed
Community: Gated Community
Location: Bellandur
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/YmmaEHU6KrqMtX3t7
```

### Message 2 (Potential Duplicate)

```
**Furnished** Semi Furnished
**BHK** 3 BHK
**Bathrooms** 2
**Balcony** 1 Balcony
Rent: 60000
Maintenance: included
Deposit: 1.5L
Sq.ft: 1300
Floor: 5th
Available From: July 15
Preferred Tenant: Family Only
Pets: allowed
Community: gated community
Location: Bellandur
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/YmmaEHU6KrqMtX3t7
```

