// Unit tests for lib/NoiseBench.groovy (pure helpers, no NM binary needed).
// Run: groovy tools/test_noisebench.groovy
import groovy.json.JsonOutput

def benchClass = new GroovyClassLoader().parseClass(new File("benchmark/simulations/lib/NoiseBench.groovy"))
def bench = benchClass.newInstance()

def failures = 0
def check = { String label, Object actual, Object expected ->
    if (actual != expected) {
        failures++
        System.err.println "FAIL ${label}: got ${actual}, expected ${expected}"
    } else {
        println "OK   ${label}"
    }
}

def tmp = File.createTempDir("noisebench", "")
try {
    def bins = ["<35","35-40","40-45","45-50","50-55","55-60","60-65","65-70","70-75","75-80",">80","NaN"]
    def features = [
        [properties: [LAEQ: 30,   PERIOD: "D"], geometry: [type: "Point", coordinates: [0, 0]]],
        [properties: [LAEQ: 42.5, PERIOD: "D"], geometry: [type: "Point", coordinates: [0, 0]]],
        [properties: [LAEQ: 77,   PERIOD: "D"], geometry: [type: "Point", coordinates: [0, 0]]],
        [properties: [LAEQ: 85,   PERIOD: "D"], geometry: [type: "Point", coordinates: [0, 0]]],
        [properties: [LAEQ: -90,  PERIOD: "D"], geometry: [type: "Point", coordinates: [0, 0]]],
        [properties: [LAEQ: 50,   PERIOD: "E"], geometry: [type: "Point", coordinates: [0, 0]]],
    ]
    def geojson = new File(tmp, "receivers.geojson")
    geojson.text = JsonOutput.toJson([type: "FeatureCollection", features: features])

    def all  = bench.computeLevelStats(geojson, false, -89.0, bins)
    def day  = bench.computeLevelStats(geojson, true,  -89.0, bins)

    check("all/most: mean",       all.mean,   (30 + 42.5 + 77 + 85 + 50) / 5)
    check("all/nan",              all.nNan,   1)
    check("all/<35",              all.histogram["<35"], 1)
    check("all/40-45",            all.histogram["40-45"], 1)
    check("all/50-55",            all.histogram["50-55"], 1)
    check("all/75-80",            all.histogram["75-80"], 1)
    check("all/>80",              all.histogram[">80"], 1)
    check("all/NaN",              all.histogram["NaN"], 1)

    check("day/mean",             day.mean,   (30 + 42.5 + 77 + 85) / 4)
    check("day/nan",              day.nNan,   1)
    check("day/excludes evening", day.histogram["50-55"], 0)

    def csv = new File(tmp, "profile.csv")
    csv.text = "foo,receiver_median_rays,bar\nx,123,y\n"
    check("readNbRays/median",        bench.readNbRays(csv, null), 123.0d)
    check("readNbRays/missing",       bench.readNbRays(new File(tmp, "missing.csv"), null), 0.0d)

    def fallback = new File(tmp, "profile-fallback.csv")
    fallback.text = "foo,receiver_median_profiles_count,bar\nx,7,y\n"
    check("readProfiles/median",      bench.readProfileCount(fallback, null), 7.0d)
    check("readProfiles/fallback",    bench.readProfileCount(new File(tmp, "missing.csv"), fallback), 7.0d)
    check("readProfiles/missing",     bench.readProfileCount(new File(tmp, "missing.csv"), null), 0.0d)
    check("readProfiles/rays-not-prof", bench.readProfileCount(csv, null), 0.0d)

    def cutCsv = new File(tmp, "profile-cut.csv")
    cutCsv.text = "time,jdbc_stack,average_cut_source_distance,cut_profile_count\n1,0,0,42\n"
    check("readCutProfiles/median",   bench.readCutProfileCount(cutCsv, null), 42.0d)
    check("readCutProfiles/missing",  bench.readCutProfileCount(csv, null), 0.0d)
} finally {
    tmp.deleteDir()
}

if (failures) {
    System.err.println "${failures} test(s) failed"
    System.exit(1)
}
println "All NoiseBench tests passed"
