import { Sun, Moon, Stars, CalendarX2, UserX, Package, Clock, RefreshCw } from 'lucide-react'

export default function RatesPolicies() {
  return (
    <section id="rates" className="mb-12">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Rates & Policies</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Column - Rates + Equipment */}
          <div className="flex flex-col space-y-4 h-full">
            {/* Daytime Rate Card */}
            <div className="rounded-2xl overflow-hidden shadow-lg flex flex-col flex-1">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white flex-1 flex items-center">
                <div className="flex gap-4 items-center w-full">
                  <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center shrink-0 w-16 h-16">
                    <Sun className="w-10 h-10 animate-spin" style={{ animationDuration: '6s' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold">Daytime Rate</h3>
                    <p className="text-white/80 text-sm">(6 AM - 6 PM)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm">Php</span>
                    <span className="text-4xl font-bold ml-1">200</span>
                    <span className="text-lg">/hr</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Evening / Early Morning Rate Card */}
            <div className="rounded-2xl overflow-hidden shadow-lg flex flex-col flex-1">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white flex-1 flex items-center">
                <div className="flex gap-4 items-center w-full">
                  <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center shrink-0 w-16 h-16">
                    <Moon className="w-10 h-10 animate-pulse" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold">Off-Peak Rate</h3>
                    <p className="text-white/80 text-sm">(5 - 6 AM &amp; 6 - 10 PM)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm">Php</span>
                    <span className="text-4xl font-bold ml-1">250</span>
                    <span className="text-lg">/hr</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Late Night Rate Card */}
            <div className="rounded-2xl overflow-hidden shadow-lg flex flex-col flex-1">
              <div className="bg-gradient-to-br from-emerald-700 to-teal-900 p-5 text-white flex-1 flex items-center">
                <div className="flex gap-4 items-center w-full">
                  <div className="p-3 bg-white/20 rounded-xl flex items-center justify-center shrink-0 w-16 h-16">
                    <Stars className="w-10 h-10 animate-pulse" style={{ animationDuration: '3s' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold">Late Night Rate</h3>
                    <p className="text-white/80 text-sm">(10 PM - 12 AM)</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm">Php</span>
                    <span className="text-4xl font-bold ml-1">300</span>
                    <span className="text-lg">/hr</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Equipment Rental Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-emerald-50 rounded-full flex items-center justify-center h-11 w-11 shrink-0">
                  <Package className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Equipment Rental</h3>
                  <p className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Effective June 1, 2026
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php50</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Paddle <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-emerald-50/60 px-4 py-3">
                  <span className="text-xl font-bold text-emerald-600 shrink-0">Php25</span>
                  <span className="text-gray-500">—</span>
                  <span className="text-sm text-gray-700">
                    Balls, set of 4 <span className="text-gray-500">(per booking)</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Policy Cards */}
          <div className="space-y-4 h-full">
            {/* Cancellation & Rescheduling Policy Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm flex flex-col justify-center">
              {/* Cancellation */}
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-emerald-50 rounded-full mb-3 flex items-center justify-center h-14 w-14">
                  <CalendarX2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Cancellation Policy</h3>
                <ul className="text-gray-700 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-600">Free</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancel 24 hours before booking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-amber-600">P100/hour</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancellation within 24 hours</span>
                  </li>
                </ul>
              </div>

              <hr className="my-4 border-emerald-100" />

              {/* Rescheduling */}
              <div className="flex flex-col items-center text-center">
                <div className="p-2 bg-emerald-50 rounded-full mb-2 flex items-center justify-center h-10 w-10">
                  <RefreshCw className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">Rescheduling Policy</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Rescheduling is only allowed in cases of rain, severe weather, or force majeure events. No rescheduling for personal reasons or no-shows.
                </p>
              </div>
            </div>

            {/* Bottom Row - Two Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* No-Show Policy Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <UserX className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">No-Show Policy</h3>
                  <p className="text-gray-600 text-sm">Full fee will be charged</p>
                </div>
              </div>

              {/* Other Equipment Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <Package className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Other Equipment</h3>
                  <p className="text-gray-600 text-sm">Charged separately upon request</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          Prices and policies are subject to change. For group bookings or special requests, please contact us.
        </p>
      </div>
    </section>
  )
}
