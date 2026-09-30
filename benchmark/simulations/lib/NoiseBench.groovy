/**
 * Shared helpers for the NoiseModelling benchmark simulation scripts.
 *
 * This class holds the logic that used to be copy-pasted in every simulation
 * script (montagneV5, montagneV6, runscriptV5, runscriptV6): loading a version
 * script, reading the profiler CSV, computing the LAEQ statistics and dumping
 * threads. Scripts load it dynamically with a GroovyClassLoader, the same way
 * they already load the per-version Noise_level_from_source scripts.
 *
 * NoiseModelling is distributed under GPL 3 license. See the repository LICENCE.
 */
import groovy.json.JsonSlurper

import java.lang.management.ManagementFactory
import java.lang.management.ThreadInfo
import java.lang.management.ThreadMXBean

class NoiseBench {

    /** Load and instantiate a Groovy script (e.g. a per-version Noise_level_from_source). */
    static Object loadScript(String path) {
        def scriptFile = new File(path).getAbsoluteFile()
        if (!scriptFile.exists()) {
            throw new FileNotFoundException("Fichier introuvable : ${scriptFile.absolutePath}")
        }
        def customClass = new GroovyClassLoader().parseClass(scriptFile)
        return customClass.newInstance()
    }

    /**
     * Number of rays read from a profiler CSV. The column was renamed between
     * versions (receiver_median_rays -> receiver_median_profiles_count); both are
     * accepted. A fallback file may be provided for the versions whose profiler
     * writes to a legacy location.
     */
    static double readNbRays(File primary, File fallback) {
        def csvFile = primary
        if (!csvFile.exists() && fallback != null) {
            csvFile = fallback
        }
        if (!csvFile.exists()) {
            return 0
        }
        def lines = csvFile.readLines()
        if (lines.size() >= 1) {
            def headers = lines[0].split(',')
            def raysIdx = headers.findIndexOf { it.trim() in ['receiver_median_rays', 'receiver_median_profiles_count'] }
            if (raysIdx >= 0) {
                def lastLine = lines[lines.size() - 1].split(',')
                if (lastLine.size() > raysIdx) {
                    return lastLine[raysIdx].trim().toDouble()
                }
            }
        }
        return 0
    }

    /**
     * Compute the LAEQ mean, the number of silenced receivers and the histogram
     * from an exported RECEIVERS_LEVEL geojson.
     *
     * onlyDay=true keeps only the "D" period (v5+ exports); onlyDay=false keeps
     * every feature (v4 exports a single period).
     */
    static Map computeLevelStats(File geojsonFile, boolean onlyDay, double silenceThreshold, List bins) {
        def json = new JsonSlurper().parse(geojsonFile)

        def values = []
        int nNan = 0

        json.features.each { f ->
            def props = f.get("properties")
            def val = props?.get("LAEQ")
            if (onlyDay) {
                def period = props?.get("PERIOD")
                if (val != null && period == "D") {
                    double laeq = Double.valueOf(val as double)
                    if (laeq <= silenceThreshold) {
                        nNan++
                    } else {
                        values.add(laeq)
                    }
                }
            } else {
                if (val != null) {
                    double laeq = Double.valueOf(val as double)
                    if (laeq <= silenceThreshold) {
                        nNan++
                    } else {
                        values.add(laeq)
                    }
                }
            }
        }

        def mean = values ? (values.sum() / values.size()) : 0.0

        def histogram = bins.collectEntries { [it, 0] }
        histogram["NaN"] = nNan

        values.each { v ->
            if      (v < 35)  histogram["<35"]++
            else if (v < 40)  histogram["35-40"]++
            else if (v < 45)  histogram["40-45"]++
            else if (v < 50)  histogram["45-50"]++
            else if (v < 55)  histogram["50-55"]++
            else if (v < 60)  histogram["55-60"]++
            else if (v < 65)  histogram["60-65"]++
            else if (v < 70)  histogram["65-70"]++
            else if (v < 75)  histogram["70-75"]++
            else if (v < 80)  histogram["75-80"]++
            else              histogram[">80"]++
        }

        return [mean: mean, nNan: nNan, histogram: histogram]
    }

    /** Dump all threads (used for diagnostics after a simulation). */
    static String threadDump(boolean lockedMonitors, boolean lockedSynchronizers) {
        StringBuffer threadDump = new StringBuffer(System.lineSeparator())
        ThreadMXBean threadMXBean = ManagementFactory.getThreadMXBean()
        for (ThreadInfo threadInfo : threadMXBean.dumpAllThreads(lockedMonitors, lockedSynchronizers)) {
            threadDump.append(threadInfo.toString())
        }
        return threadDump.toString()
    }
}
