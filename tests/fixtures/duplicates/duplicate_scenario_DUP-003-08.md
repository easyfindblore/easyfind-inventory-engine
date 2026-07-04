# Duplicate Scenario: Spacing Differences

## Scenario ID: DUP-003-08

## Expected Outcome: Existing Property Updated (No new data, if parser normalizes spacing)

### Message 1 (Base Property)

```
**Furnished** Fully Furnished
**BHK** 2 BHK
**Bathrooms** 3
**Balcony** 1 Balcony
Rent: 50000
Maintenance: included
Deposit: 2L
Sq.ft: 1200
Floor: 5th
Available From: Immediately
Preferred Tenant: Anyone
Pets: allowed
Community: Semi Gated
Location: Bellandur
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

### Message 2 (Potential Duplicate)

```
**Furnished** Fully Furnished
**BHK** 2BHK
**Bathrooms** 3
**Balcony** 1 Balcony
Rent: 50000
Maintenance: included
Deposit: 2L
Sq.ft: 1200
Floor: 5th
Available From: Immediately
Preferred Tenant: Anyone
Pets: allowed
Community: Semi Gated
Location: Bellandur
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

