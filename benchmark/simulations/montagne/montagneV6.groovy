/**
 * NoiseModelling is an open-source tool designed to produce environmental noise maps
 * on very large urban areas. It can be used as a Java library or be controlled through
 * a user friendly web interface.
 *
 * This version is developed by the DECIDE team from the Lab-STICC (CNRS) and by the
 * Mixt Research Unit in Environmental Acoustics (Université Gustave Eiffel).
 * <http://noise-planet.org/noisemodelling.html>
 *
 * NoiseModelling is distributed under GPL 3 license. You can read a copy of this
 * License in the file LICENCE provided with this software.
 *
 * Contact: contact@noise-planet.org
 */

/**
 * @Author Pierre Aumond, Université Gustave Eiffel
 * @Author Nicolas Fortin, Université Gustave Eiffel
 */


import groovy.sql.Sql
import org.noise_planet.noisemodelling.scripts.NoiseModelling.Noise_level_from_source
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Export_Table
import org.noise_planet.noisemodelling.scripts.Geometric_Tools.Set_Height
import org.noise_planet.noisemodelling.scripts.Import_and_Export.Import_File
import org.h2gis.utilities.JDBCUtilities


import java.lang.management.ManagementFactory
import java.lang.management.ThreadInfo
import java.lang.management.ThreadMXBean
import java.sql.Connection
import java.text.DecimalFormat
import java.util.concurrent.TimeUnit
import groovy.json.JsonSlurper
import groovy.json.JsonOutput


title = 'NoiseModelling benchmark simulation'
description = 'NoiseModelling benchmark simulation'

inputs = [
        NM_version:[
                title      : 'Version of NoiseModelling',
                name       : 'Version of NoiseModelling',
                description: 'Version of NoiseModellingd.',
                min        : 0, max: 1,
                type       : String.class,
        ],
        campagne:[
                title      : 'Measurement campaign id',
                name       : 'Measurement campaign id',
                description: 'Measurement campaign id (c1, c2...). Meteo parameters are taken from the campaign configuration.',
                min        : 0, max: 1,
                type       : String.class,
        ],
        scenario:[
                title      : 'Meteorological scenario',
                name       : 'Meteorological scenario',
                description: 'homogene (occurrences 0 everywhere) or favorable (occurrences 1 everywhere); campaign temperature/humidity are kept.',
                min        : 0, max: 1,
                type       : String.class,
        ]]

outputs = [result: [name: 'Result output string', title: 'Result output string', description: 'This type of result does not allow the blocks to be linked together.', type: String.class]]

private static String threadDump(boolean lockedMonitors, boolean lockedSynchronizers) {
    StringBuffer threadDump = new StringBuffer(System.lineSeparator());
    ThreadMXBean threadMXBean = ManagementFactory.getThreadMXBean();
    for(ThreadInfo threadInfo : threadMXBean.dumpAllThreads(lockedMonitors, lockedSynchronizers)) {
        threadDump.append(threadInfo.toString());
    }
    return threadDump.toString();
}

static def exec(Connection connection, Map input) {
    String version=""
    if(input.containsKey('NM_version')){
        version=input["NM_version"] as String
    }
    String campagne = input.containsKey('campagne') && input["campagne"] ? (input["campagne"] as String) : "c1"
    String scenario = input.containsKey('scenario') && input["scenario"] ? (input["scenario"] as String) : "homogene"
    boolean homogene = scenario == "homogene"
    boolean legacyNames = campagne == "c1" && homogene
    def outputFolder = new File("benchmark/output/montagne/$version")
    if (!outputFolder.exists()) {
        outputFolder.mkdir()
    }
    def redoDelaunayGrid = false
    def redoRoadsEmission = false
    def redoCompute = true
    def sql = new Sql(connection)

    def bench = new GroovyClassLoader()
            .parseClass(new File("benchmark/simulations/lib/NoiseBench.groovy"))
            .newInstance()

    def config = new JsonSlurper().parse(new File("benchmark/config/benchmark.json"))
    double silenceThreshold = config.constants.silenceThreshold as double
    def bins = config.constants.histogramBins as List

    if (!JDBCUtilities.tableExists(connection, "BUILDINGS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/montagne/la_montagne_batiment.geojson",
                 "inputSRID": "2154",
                 "tableName": "BUILDINGS"])
    }

    if (!JDBCUtilities.tableExists(connection, "DEM")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/montagne/DEM.geojson",
                 "inputSRID": 2154,
                 "tableName": "DEM"])
    }

    if (!JDBCUtilities.tableExists(connection, "GROUNDS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/montagne/la_montagne_naturesol.geojson",
                 "inputSRID": "2154",
                 "tableName": "GROUNDS"])
    }

    if (!JDBCUtilities.tableExists(connection, "LW_ROADS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/montagne/LW_ROADS.geojson",
                 "inputSRID": 2154,
                 "tableName": "LW_ROADS"])

    }

    if (!JDBCUtilities.tableExists(connection, "RECEIVERS")) {
        new Import_File().exec(connection,
                ["pathFile" : "benchmark/input/montagne/RECEIVERS.geojson",
                 "inputSRID": "2154",
                 "tableName": "RECEIVERS"])
    }

    long elapsed = 0

    if(redoCompute) {

        long startCompute = System.currentTimeMillis()
            config.models.montagne.setHeight.each { h ->
                new Set_Height().exec(connection, ["tableName": h.tableName, "height": h.height])
            }

            def customScripts = [
                    "v6.0.0"         : "benchmark/simulations/v6Noise_level_from_source.groovy",
                    "v6.0.1"         : "benchmark/simulations/v601Noise_level_from_source.groovy",
                    "v6.0.2-SNAPSHOT": "benchmark/simulations/v602Noise_level_from_source.groovy"
            ]
            def execParams = new LinkedHashMap(config.models.montagne.exec)
            def campConf = config.models.montagne.campaigns?.get(campagne)?.exec
            if (campConf != null) {
                execParams.putAll(campConf as Map)
            }
            def scenConf = config.models.montagne.scenarios?.get(scenario)?.exec
            if (scenConf != null) {
                execParams.putAll(scenConf as Map)
            }
            // v6.0.0 reads confFavorableOccurrencesDefault, v6.0.1/v6.0.2 read the
            // British spelling confFavourableOccurrencesDefault: expose both.
            if (execParams.containsKey("confFavorableOccurrencesDefault")) {
                execParams["confFavourableOccurrencesDefault"] = execParams["confFavorableOccurrencesDefault"]
            }
            execParams["confRecordProfile"] = true
            execParams["confProfilePath"] = "$outputFolder/profile_${campagne}_${scenario}.csv"
            def scriptPath = customScripts[version]
            if (scriptPath != null) {
                def customScript = new GroovyClassLoader().parseClass(new File(scriptPath)).newInstance()
                customScript.exec(connection, execParams)
            } else {
                new Noise_level_from_source().exec(connection, execParams)
            }

        elapsed = System.currentTimeMillis() - startCompute
        sql.execute("DROP TABLE IF EXISTS RECEIVERS_LEVEL_D")

        sql.execute("CREATE TABLE RECEIVERS_LEVEL_D AS SELECT * FROM RECEIVERS_LEVEL WHERE PERIOD='D'")


        new Export_Table().exec(connection,
                ["exportPath"   : "$outputFolder/RECEIVERS_LEVEL_${campagne}_${scenario}.geojson",
                 "tableToExport": "RECEIVERS_LEVEL_D"])
        if (homogene) {
            new Export_Table().exec(connection,
                    ["exportPath"   : "$outputFolder/RECEIVERS_LEVEL_${campagne}.geojson",
                     "tableToExport": "RECEIVERS_LEVEL_D"])
        }
        if (legacyNames) {
            new Export_Table().exec(connection,
                    ["exportPath"   : "$outputFolder/RECEIVERS_LEVEL.geojson",
                     "tableToExport": "RECEIVERS_LEVEL_D"])
        }

        if (homogene) try {
            def notableTypes = ['Reflection', 'DIFH', 'DIFH_RCRIT', 'VEdgeDiffraction', 'Diffraction'] as Set
            def raysFeatures = []
            def pathSlurper = new JsonSlurper()
            sql.eachRow("SELECT IDRECEIVER, IDSOURCE, LEQ, METEO, PERIOD, PATH FROM RAYS") { row ->
                def path = pathSlurper.parseText(row.PATH as String)
                def cutPoints = path.cutProfile?.cutPoints ?: []
                def coords = cutPoints.collect { c -> [c.coordinate.x, c.coordinate.y, c.coordinate.z] }
                if (!coords.isEmpty()) {
                    def nodes = cutPoints.findAll { c -> notableTypes.contains(c.type) }
                            .collect { c -> [c.type, c.coordinate.x, c.coordinate.y, c.coordinate.z] }
                    def nRefl = cutPoints.count { it.type == 'Reflection' }
                    def nDiff = cutPoints.count { notableTypes.contains(it.type) && it.type != 'Reflection' }
                    raysFeatures << [
                            type: 'Feature',
                            properties: [
                                    receiver    : row.IDRECEIVER,
                                    source      : row.IDSOURCE,
                                    campagne    : campagne,
                                    leq         : row.LEQ,
                                    meteo       : row.METEO,
                                    period      : row.PERIOD,
                                    aDiv        : path.aDiv ? path.aDiv[0] : null,
                                    aAtm        : path.aAtm ? path.aAtm[0] : null,
                                    aDif        : path.aDif ? path.aDif[0] : null,
                                    aRef        : path.aRef ? path.aRef[0] : null,
                                    aGlobal     : path.aGlobal ? path.aGlobal[0] : null,
                                    ground      : path.groundAttenuation,
                                    nReflections: nRefl,
                                    nDiffractions: nDiff,
                                    nodes       : nodes
                            ],
                            geometry: [type: 'LineString', coordinates: coords]
                    ]
                }
            }
            def raysCollection = [type: 'FeatureCollection',
                                  crs : [type: 'name', properties: [name: 'urn:ogc:def:crs:EPSG::2154']],
                                  features: raysFeatures]
            new File("$outputFolder/rays_${campagne}_${scenario}.geojson").text = JsonOutput.toJson(raysCollection)
            new File("$outputFolder/rays_${campagne}.geojson").text = JsonOutput.toJson(raysCollection)
        } catch (Exception e) {
            println("Ray export skipped: " + e.message)
        }

    }

    threadDump(true, true)


    def cpt = sql.firstRow("SELECT COUNT(*) FROM RECEIVERS")[0] as Integer
    def nbRays =  sql.firstRow("SELECT COUNT(*) FROM RAYS")[0] as Integer
    double time = elapsed/cpt
    def timeray = 0
    if (nbRays != 0) {
        timeray = elapsed/nbRays
    }

    def profileCsv = new File("$outputFolder/profile_${campagne}_${scenario}.csv")
    if (!profileCsv.exists()) {
        def profileFiles = [new File("$outputFolder"), new File("."), new File("benchmark/output/montagne/$version")]
                .findAll { it?.isDirectory() }
                .collectMany { d -> d.listFiles().findAll { it.name.startsWith("profile") && it.name.endsWith(".csv") } }
        def scoped = profileFiles.findAll { it.name.contains("_${scenario}") }
        def candidates = scoped ?: profileFiles
        profileCsv = candidates ? candidates.max { it.lastModified() } : null
    }
    def nbProfiles = 0
    if (profileCsv?.exists()) {
        def cutProfiles = bench.readCutProfileCount(profileCsv, null)
        nbProfiles = cutProfiles > 0 ? cutProfiles : bench.readProfileCount(profileCsv, null) * cpt
    }
    def timePerProfiles = nbProfiles > 0 ? elapsed / nbProfiles : 0

    long hours = TimeUnit.MILLISECONDS.toHours(elapsed)
    elapsed -= TimeUnit.HOURS.toMillis(hours)
    long minutes = TimeUnit.MILLISECONDS.toMinutes(elapsed)
    elapsed -= TimeUnit.MINUTES.toMillis(minutes)
    long seconds = TimeUnit.MILLISECONDS.toSeconds(elapsed)
    String timeString = String.format(Locale.ROOT, "%02d:%02d:%02d", hours, minutes, seconds)

    println("Compuation of $cpt receivers in $timeString ( ${time} milliseconds per receiver")

    def stats = bench.computeLevelStats(new File("$outputFolder/RECEIVERS_LEVEL_${campagne}.geojson"), true, silenceThreshold, bins)

    DecimalFormat f = new DecimalFormat()
    f.setMaximumFractionDigits(2)


    def result = [
            mean: stats.mean,
            time: timeString,
            timePerReceive: f.format(time),
            java: System.getProperty("java.version"),
            runner: "montagne-v6",
            nbRays : nbRays,
            nbProfiles: nbProfiles,
            timePerProfiles: timePerProfiles,
            nNan: stats.nNan,
            silenceThreshold: silenceThreshold,
            timePerRays: timeray,
            histogram: stats.histogram
    ]

    result.campagne = campagne
    result.scenario = scenario
    result.version = version
    def statsJson = JsonOutput.prettyPrint(JsonOutput.toJson(result))
    new File("$outputFolder/stats_${version}_${campagne}_${scenario}.json").text = statsJson
    if (homogene) {
        new File("$outputFolder/stats_${version}_${campagne}.json").text = statsJson
    }
    if (legacyNames) {
        new File("$outputFolder/stats_${version}.json").text = statsJson
    }

    println("fini***************************************************************************")

    System.exit(0)
}
