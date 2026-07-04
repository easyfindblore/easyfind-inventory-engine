# Duplicate Scenario: Location Typo

## Scenario ID: DUP-004-03

## Expected Outcome: New Property (if parser cannot normalize) or Existing Property Updated (if parser normalizes)

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
Community: Gated Community
Location: Bellandua
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/YmmaEHU6KrqMtX3t7
```

