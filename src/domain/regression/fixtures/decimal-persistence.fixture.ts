export const decimalPersistenceGolden = {
  domainSignificantDigits: 20,
  finite: {
    inputValues: ["0.1", "0.11", "0.12"],
    average: "0.11",
  },
  repeatingFractions: [
    { expression: "1 / 3", numerator: "1", denominator: "3", expected: "0.33333333333333333333" },
    { expression: "2 / 3", numerator: "2", denominator: "3", expected: "0.66666666666666666667" },
    { expression: "10 / 3", numerator: "10", denominator: "3", expected: "3.3333333333333333333" },
    { expression: "1000 / 3", numerator: "1000", denominator: "3", expected: "333.33333333333333333" },
  ],
  qingbiao: {
    k1Rates: ["0.1", "0.11", "0.13", "0.14", "0.16"],
    k1: "0.128",
    k2Rate: "0.01",
    referencePriceB: "876.662",
  },
  dingbiao: {
    finalistRates: ["0.1", "0.11", "0.13"],
    k1: "0.11333333333333333333",
    finalDrawValue: "0.01",
    benchmarkPriceM: "889.87666666666666667",
  },
  project: {
    maxBidPrice: "1001",
    nonCompetitiveFee: "100",
  },
  verySmallPercentage: "0.00000000000000012345",
  highValueBidPrice: "999999999999999.99",
  closeDifferenceBoundary: {
    first: "10.000000000000001",
    second: "10.000000000000002",
    exactGap: "0.000000000000001",
  },
} as const;

export type DecimalRoundTripMeasurement = {
  label: string;
  original: string;
  readBack: string;
  absoluteDelta: string;
  relativeDelta: string;
};
