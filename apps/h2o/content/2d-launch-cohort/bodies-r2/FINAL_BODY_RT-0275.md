# Cooling Tower Design Parameters: Approach & Range Fundamentals

*By Tim Bozic. Published 2026-02-13 09:18:18. Last updated 2026-08-13 12:10:21.*

This guide defines each one, gives the formula that links them, and shows how the choices trade against each other.

Cooling tower design parameters are the approach, range, and design wet-bulb temperature that together set a tower's size, energy draw, and lifecycle cost. Range tells you how many degrees the tower must remove per pass.

Approach tells you how close the tower gets to the wet-bulb limit. A tighter tower approach temperature buys colder outlet water temperature at the cost of a larger, pricier unit. Get these three numbers right before you ever call a vendor.

## Cooling Tower Design Parameter Definitions

The ranges quoted in this article describe what is commonly specified in practice, so that a reader can tell a conventional design point from an unusual one. They are orientation, not design values: the range and approach for a particular tower follow from the process duty and the site's design wet bulb, and the tower is then selected against them from the manufacturer's performance data.

To effectively size and select a cooling tower, one must first master the specific terminology used in the industry. The two most critical cooling tower design parameters are "range" and "approach," which together define the thermal duty the tower must perform.

## Range

The range represents the temperature difference between the hot water entering the cooling tower and the cold water leaving it. It indicates exactly how much heat the tower rejects from the water during a single pass through the fill media.

To calculate the range, you simply subtract the cold water outlet temperature from the hot water inlet temperature:

## Range = Temperature (Hot Water Inlet) − Temperature (Cold Water Outlet)

In many general-purpose applications the range commonly falls between 10°F and 15°F (5.5°C to 8.3°C). That describes what is usually specified rather than a requirement of any standard or code; where a project specification or governing document does fix a range, its edition, scope and jurisdiction have to be confirmed for the site before it is treated as binding. Industrial processes often require a higher range depending on the heat load. The range is set by the process heat load and the circulating water flow rate, not by the tower's capability.

## Approach

Approach is the gap between the outlet water temperature leaving the tower and the ambient wet-bulb temperature of the entering air, showing how close the tower comes to the theoretical cooling limit.

The formula for the approach is:

## Approach = Temperature (Cold Water Outlet) − Wet-Bulb Temperature

A lower approach means the cold water temperature is closer to the wet-bulb temperature, which indicates higher thermal performance. However, achieving a lower approach generally requires a larger tower and more airflow, with the added size and cost read from the manufacturer's selection for the duty. Approach values around 5°F to 7°F (2.8°C to 3.9°C) are common in industrial work, and HVAC selections are often looser, but that is observed practice rather than a figure fixed by a standard; where a project document sets an approach, its edition, scope and jurisdiction must be confirmed for the site.

## The Relationship Between Approach and Range

Understanding how these two variables interact is essential for balancing system efficiency with capital cost. The approach and range relationship dictates the physical size of the tower and its ability to reject heat under varying atmospheric conditions.

Cooling tower thermal effectiveness is commonly expressed as a ratio of these two parameters, using the convention below. It is an index for comparing design points on the same duty, not a universal efficiency standard and not a measure of the energy the tower consumes:

## Efficiency = (Range / (Range + Approach)) × 100

When the approach decreases while the range remains constant, this ratio rises, which is why it is used as a comparative indicator of thermal performance at a fixed duty. However, the law of diminishing returns applies here; as the approach approaches zero, the required tower size grows asymptotically.

A specific "cooling tower design parameter" set must balance the need for cold water against the exponential increase in fan power and surface area required to achieve it.

## Thermal Design Basics

Successful cooling tower selection relies on accurate data regarding heat loads and environmental conditions . Ignoring thermal design basics can lead to undersized units that fail to cool the process water on hot days or oversized units that waste capital and energy.

## Heat Load and Cooling Requirements

The heat load is the amount of heat energy the tower must remove from the system per unit of time. This value is a fixed requirement of the process or chiller that the tower serves and is calculated using the mass flow rate, specific heat of water, and temperature differential.

## Q = m × Cp × ΔT

Getting the design point right is not optional. If cooling tower design parameters do not account for peak cooling load, the process fluid returns hotter than downstream equipment can handle, which can trip the system or cut production capacity.

## Ambient Wet Bulb Considerations

The ambient wet-bulb temperature acts as the absolute thermal floor for evaporative cooling. No matter how large or efficient the cooling tower is, it cannot cool water to a temperature lower than the entering air's wet-bulb temperature.

Designers should choose a design wet-bulb temperature that reflects the local climate, commonly taken from ASHRAE weather data for a representative nearby station. Which data set, station and annual percentile apply is a project decision rather than a blanket compliance requirement, so confirm the edition, scope and jurisdiction of the source for the site.

Selecting a value too low may lead to a tower unable to meet demand during summer peaks.

Choosing a value too high can lead to unnecessary capital costs.

## Impact on Tower Performance

The interaction between design wet bulb, range, and approach shapes actual field performance, which is why manufacturers publish tower performance curves for each model and flow rate. These curves plot how cold water temperature shifts as ambient wet bulb changes, confirming a tower will hold its design approach across a real weather range, not just at one design point.

A tower selected for a tighter approach holds colder water, which helps condenser-side performance, but it needs more fill surface and airflow than one selected for a looser approach on the same duty. How much larger and how much more costly follows from the manufacturer's selection at the site's design wet bulb, not from a fixed ratio between the two approaches.

## Cooling Tower Performance Specification

When creating a performance specification for vendors, an unambiguous statement of the duty is what makes bids comparable, because each manufacturer otherwise selects against its own assumptions. Define the operating conditions and the expected thermal performance explicitly, so the basis of every quotation can be checked during procurement.

Engineers typically include the following data points in a specification document, since these are the inputs a manufacturer needs before it can select a unit against its own performance data:

- **Design Heat Load:** The total amount of energy to be rejected (BTU/hr or kW).

- **Water Flow Rate:** The volume of water circulating through the system (GPM or m³/hr).

- **Entering Water Temperature:** The temperature of the hot water returning from the process.

- **Leaving Water Temperature:** The required cold water temperature needed by the equipment.

- **Design Wet-Bulb Temperature:** The worst-case ambient humidity and temperature condition.

## Selecting Design Points (Practical Guidance)

Selecting the right design point is as much an art as it is a science, requiring a balance between theoretical physics and economic reality. A design point chosen against the actual duty and the site's design conditions is what keeps the tower matched to the facility's needs without overextending the budget. The balance struck is a project judgement, and the selection is confirmed against the manufacturer's performance data.

## Trade-Offs in Parameter Selection

Every design choice carries a consequence regarding size, energy use, or cost. Engineers weigh the benefit of colder water against larger equipment footprints and higher fan power. The size of each penalty for a given change in approach or range is not a general figure: it comes from the manufacturer's selection for the duty and the site's design wet bulb.

Key trade-offs to consider when finalizing cooling tower design parameters include:

Approach vs. Size: Tightening the approach drives tower size up, and the increase steepens as the approach closes on the wet bulb. How much larger the tower gets for a given approach is not a fixed percentage — it comes from the manufacturer's selection for the duty, the fill and the design wet bulb.

Range vs. Flow: Increasing the range allows for lower flow rates, which reduces pump energy but may require larger heat exchangers at the process end.

- **Fan Power:** Tighter design parameters often require higher airflow, leading to increased fan motor horsepower and operating costs.

## Real-World Example Design Case

What follows is an illustrative worked example, used to show how the arithmetic fits together. It is not a record of a specific project, and the figures below are assumed inputs, not recommended values: actual selection varies with duty, entering wet bulb, flow, tower configuration and the manufacturer's curves. Take a system circulating 1,000 GPM with a heat rejection load.

Given:

- **Flow Rate:** 1,000 GPM

- **Hot Water Inlet:** 95°F

- **Cold Water Outlet Target:** 85°F

- **Design Wet Bulb:** 78°F

Calculation:

## Approach = 85°F - 78°F = 7°F

In this worked example the tower cools the assumed 1,000 GPM flow by the 10°F range taken above, while the assumed entering wet bulb sets a theoretical minimum of 78°F for the leaving water. Whether the resulting 7°F approach corresponds to a conventional tower size for this duty is settled by the manufacturer's selection at the site's design conditions, not by the approach figure on its own.

If the same example asked for an 80°F cold water outlet, the arithmetic gives a 2°F approach against the assumed wet bulb. An approach that close to the wet bulb pushes the selection hard, and whether it can be met at all, and at what tower size and cost, is determined by the manufacturer's selection at the site's design conditions.

## Effects of Approach & Range on Operating Efficiency

The selection of cooling tower design parameters has a direct downstream effect on the efficiency of the chillers or process equipment the tower serves. A lower approach temperature allows the tower to deliver colder water, which improves the heat transfer rate in condensers.

- **Chiller Efficiency:** Lower condensing water temperature reduces the lift the compressor works against, which generally improves chiller efficiency. How much each degree buys varies with the machine and the operating point, and is read from the chiller manufacturer's performance data.

- **Energy Savings:** Colder condenser water lowers chiller lift, so a tighter approach reduces compressor energy. The size of that reduction is read off the chiller manufacturer's performance data at the actual entering condenser water temperature, not from a general percentage.

- **Net Impact:** A tighter approach usually costs extra fan power at the tower while reducing compressor energy at the chiller. Whether the net is a saving, and how large, depends on the plant's load profile and operating hours, and is worked out from the equipment performance data for the specific installation.

## Design Considerations for Different Cooling Tower Types

Different cooling tower configurations respond differently to changes in approach and range. Whether the system utilizes natural draft, induced draft, crossflow, or counterflow designs impacts how easily it can achieve tight design parameters.

When matching specific tower types to your design goals, consider how the airflow and water distribution interact:

- **Counterflow Towers:** Generally more efficient at achieving a close approach because the coldest air contacts the coldest water. These counterflow towers are compact and ideal for applications where space is limited. However, their design may require higher energy input for air movement.

- **Crossflow Towers:** Often have lower static pressure drops but may require more fill volume to achieve the same tight approach as a counterflow unit. They are easier to maintain due to their open layout, which allows for easier access to internal components. Crossflow towers are also well-suited for areas with low water quality.

- **Natural Draft:** Heavily dependent on the range and humidity; these are typically used only for very large heat loads where mechanical fans are impractical. Their reliance on natural airflow makes them highly energy-efficient, but they require significant space and are often associated with industrial-scale applications.

## Water Loss, Evaporation, and Circulating Water Systems

Water loss is a design parameter in its own right, directly affecting makeup water sizing and chemical treatment cost across the circulating water loop. Evaporation is the primary mechanism a tower uses to reject heat, and evaporation loss runs roughly 1% of circulating flow per 10°F of range; on the 1,000 GPM example above, that is roughly 10 GPM lost to evaporation alone. It is not the only source, though: drift, the fine mist carried out with exhaust air, and blowdown, water deliberately discharged to control dissolved solids, both add to the total. Drift carries circulating water out of the tower and blowdown leaves the site as a discharge, so both are handled under the facility's water management programme, the tower manufacturer's instructions and the discharge and public-health rules that apply at the site. A realistic water balance needs all three, or makeup sizing will run short.

## Avoid These Common Cooling Tower Design Mistakes

Even experienced engineers can fall into traps when specifying cooling towers if they overlook local variables or system integration. Avoiding these common errors removes several of the failure modes most often introduced at the specification stage. Reliability and service life still depend on the installed design, the duty the plant runs and the maintenance the facility carries out.

Review these frequent design pitfalls when checking whether a set of cooling tower design parameters is realistic for the site:

- **Ignoring Local Microclimates:** Regional weather data may not represent the air actually entering the tower where local heat sources or recirculation from nearby equipment raise the entering wet bulb, and a selection made on that data can fall short of duty. Confirm the entering condition for the proposed layout with the tower manufacturer.

- **Unrealistic Approach Goals:** Specifying an approach of 2°F or 3°F pushes the selection hard against the wet bulb, where tower size rises steeply for each further degree and the duty may not be achievable at all at the site's design conditions. Check the ambition against the manufacturer's selection before it is written into a specification.

- **Flow Mismatch:** Failing to verify that the actual pump flow matches the design flow can skew the range, altering the heat transfer dynamics.

- **Improper Water Treatment:** Without treatment matched to the circulating water, scaling, corrosion and biological fouling are the general mechanisms that degrade heat transfer and attack tower materials. The chemistry, materials, treatment and applicable rules are site-specific, set by the site's water management programme, the product labels and the equipment manufacturer's guidance.

- **Neglecting Maintenance Needs:** A layout that leaves fill, drift eliminators, water distribution and the drive train hard to reach makes routine work slower and can add operating cost and downtime. Access and clearance requirements come from the tower manufacturer's maintenance instructions and the project specification.

## Conclusion

Mastering cooling tower design parameters starts with getting range and approach right for your actual heat load and site climate, not a generic catalog number. Engineers who balance approach against tower size, confirm the manufacturer's performance curves for the selected model, and budget for total water loss are in a better position to hold the rated outlet water temperature in service, whether specifying a new installation or re-evaluating an existing plant. Sustained performance also depends on the water treatment and maintenance the site carries out.

### What is the difference between approach and range?

Range is the temperature drop between the hot water entering the tower and the cold water leaving it. Approach is the gap between that leaving cold water and the ambient wet-bulb temperature. Range reflects the heat load; approach reflects how close the tower gets to its physical cooling limit.

### What is a good design approach value for industrial towers?

There is no single correct figure. The design approach follows from the cold water temperature the process needs and the site's design wet bulb, and the tower is then selected against that pair from the manufacturer's performance data. Tightening the approach trades capital cost for colder water, and the size increase steepens as the leaving water temperature closes on the wet bulb, so the point where further tightening stops paying is found from the selection for the duty rather than from a general range.

### How does wet bulb affect design parameters?

Wet-bulb temperature sets the absolute floor for evaporative cooling. A higher wet bulb forces the designer to accept a warmer outlet water temperature or build a larger tower to hold the same cold water target.

### Why do low approach towers cost more?

As approach shrinks, the temperature difference driving heat transfer shrinks with it, so the tower needs significantly more fill surface area and airflow to remove the remaining heat, which drives up size and cost.

### How much water does a cooling tower lose to evaporation?

Evaporation loss typically runs close to 1% of circulating flow for every 10°F of range, though drift and blowdown add to total water loss on top of that. Actual numbers shift with cycles of concentration and local humidity.

### What is a cooling tower ton?

A cooling tower ton is a nominal rating convention: it is commonly taken as roughly 15,000 BTU/hr of heat rejection at the nominal rating conditions, above the 12,000 BTU/hr refrigeration ton because the tower also rejects the heat the compressor adds to the load. It is a catalog convention rather than a mandatory requirement, so the rating basis and the conditions behind any quoted tonnage should be confirmed against the manufacturer's rating data and the project specification.

## Request a quote

Request a quote: no telephone number, email address or live-chat widget appears on any page.

## Related pages

- [Cooling Tower Heat Load Calculation: The 2026 Guide](/cooling-tower-heat-load/)
- [Cooling Tower Ton Calculation: Master Precision Sizing](/cooling-tower-ton-calculation/)
- [Mastering Cooling Tower Performance Curves](/cooling-tower-performance-curve/)
- [Technical articles](/tech-articles/)
